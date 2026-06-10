package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.ActionType;
import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ExplorationService {

    private static final Logger log = LoggerFactory.getLogger(ExplorationService.class);

    static final double EXPLORATION_PROBABILITY = 0.05;
    static final int LOOKBACK_DAYS = 30;

    private final UserActivityLogRepository userActivityLogRepository;
    private Random random = new Random();

    public ExplorationService(UserActivityLogRepository userActivityLogRepository) {
        this.userActivityLogRepository = userActivityLogRepository;
    }

    // 테스트에서 mock Random을 주입받기 위한 setter
    void setRandom(Random random) {
        this.random = random;
    }

    public List<ScoredTaskResponse> applyExplorationMode(Long userId, List<ScoredTaskResponse> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return tasks;
        }

        // 확률 미통과 → 탐색 없음
        if (random.nextDouble() >= EXPLORATION_PROBABILITY) {
            clearFlags(tasks);
            return tasks;
        }

        // 바운드: 긴급(RED) 작업이 있으면 탐색으로 가리지 않는다("바쁜 날엔 우회 금지").
        boolean hasUrgent = tasks.stream().anyMatch(ScoredTaskResponse::isRed);
        if (hasUrgent) {
            log.info("Exploration skipped for user {}: urgent(RED) task present.", userId);
            clearFlags(tasks);
            return tasks;
        }

        log.info("Exploration Mode activated for user: {}", userId);

        // 최근 LOOKBACK_DAYS일간의 완료 로그 조회
        LocalDateTime since = LocalDateTime.now().minusDays(LOOKBACK_DAYS);
        List<UserActivityLog> completedLogs = userActivityLogRepository
                .findByUserIdAndLoggedAtAfterAndActionType(userId, since, ActionType.COMPLETED);

        if (completedLogs.isEmpty()) {
            log.info("No completed logs in the last {} days for user {}. Aborting exploration mode.", LOOKBACK_DAYS, userId);
            clearFlags(tasks);
            return tasks;
        }

        // 카테고리별 COMPLETED 카운트
        Map<String, Long> categoryCounts = completedLogs.stream()
                .collect(Collectors.groupingBy(UserActivityLog::getCategory, Collectors.counting()));

        // 후보 카테고리 중 최근 완료 건수가 최소인 카테고리 선택
        Set<String> candidateCategories = tasks.stream()
                .map(ScoredTaskResponse::getCategory)
                .collect(Collectors.toSet());
        String targetCategory = candidateCategories.stream()
                .min((c1, c2) -> Long.compare(
                        categoryCounts.getOrDefault(c1, 0L),
                        categoryCounts.getOrDefault(c2, 0L)))
                .orElse(null);

        if (targetCategory != null) {
            ScoredTaskResponse pick = tasks.stream()
                    .filter(t -> targetCategory.equals(t.getCategory()))
                    .findFirst()
                    .orElse(null);

            if (pick != null) {
                pick.setExploration(true);

                long completedInCategory = categoryCounts.getOrDefault(targetCategory, 0L);
                pick.setReason(String.format(
                        "최근 %d일 완료가 가장 적은 '%s' 카테고리 (완료 %d건) — 탐색 추천",
                        LOOKBACK_DAYS, targetCategory, completedInCategory));

                // 1순위는 사용자의 진짜 최우선이 지키도록, 탐색 픽은 2순위로만 승격한다(점수는 위조하지 않음).
                // 이미 1·2위면 그대로 둔다. 무작위로 최상단을 갈아치우던 동작을 제거 → "내 1순위"의 결정론 보장.
                int idx = tasks.indexOf(pick);
                if (idx > 1) {
                    tasks.remove(idx);
                    tasks.add(1, pick);
                }

                log.info("Selected task {} from category '{}' for exploration. Promoted to rank 2 (score unchanged).",
                        pick.getTaskId(), targetCategory);
            }
        }

        return tasks;
    }

    private static void clearFlags(List<ScoredTaskResponse> tasks) {
        for (ScoredTaskResponse task : tasks) {
            task.setExploration(false);
        }
    }
}
