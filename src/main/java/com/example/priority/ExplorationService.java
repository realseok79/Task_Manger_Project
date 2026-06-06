package com.example.priority;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ExplorationService {

    private static final Logger log = LoggerFactory.getLogger(ExplorationService.class);

    // 기본값(테스트·폴백). 운영에선 engine.exploration.* 로 재정의.
    static final double DEFAULT_PROBABILITY = 0.05;
    static final int DEFAULT_LOOKBACK_DAYS = 30;
    static final double DEFAULT_BOOST_FACTOR = 1.5;
    static final double DEFAULT_MIN_BASE_SCORE = 1.0;

    private final UserActivityLogRepository userActivityLogRepository;
    private final Random random;
    private final Clock clock;
    private final double explorationProbability;
    private final int lookbackDays;
    private final double boostFactor;
    private final double minBaseScore;

    /** 테스트/기본값 생성자. */
    public ExplorationService(UserActivityLogRepository userActivityLogRepository, Random random, Clock clock) {
        this(userActivityLogRepository, random, clock,
                DEFAULT_PROBABILITY, DEFAULT_LOOKBACK_DAYS, DEFAULT_BOOST_FACTOR, DEFAULT_MIN_BASE_SCORE);
    }

    /** Spring 설정 주입 생성자. */
    @Autowired
    public ExplorationService(UserActivityLogRepository userActivityLogRepository, Random random, Clock clock,
                              EngineProperties properties) {
        this(userActivityLogRepository, random, clock,
                properties.getExploration().getProbability(),
                properties.getExploration().getLookbackDays(),
                properties.getExploration().getBoostFactor(),
                properties.getExploration().getMinBaseScore());
    }

    private ExplorationService(UserActivityLogRepository userActivityLogRepository, Random random, Clock clock,
                               double explorationProbability, int lookbackDays, double boostFactor, double minBaseScore) {
        this.userActivityLogRepository = userActivityLogRepository;
        this.random = random;
        this.clock = clock;
        this.explorationProbability = explorationProbability;
        this.lookbackDays = lookbackDays;
        this.boostFactor = boostFactor;
        this.minBaseScore = minBaseScore;
    }

    public List<TaskResponse> applyExplorationMode(Long userId, List<TaskResponse> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return tasks;
        }

        // 확률 미통과 → 탐색 없음
        if (random.nextDouble() >= explorationProbability) {
            clearFlags(tasks);
            return tasks;
        }

        // 바운드: 긴급(RED) 작업이 있으면 탐색으로 가리지 않는다("바쁜 날엔 우회 금지").
        boolean hasUrgent = tasks.stream().anyMatch(t -> UrgencyEvaluator.RED.equals(t.getUrgencyLevel()));
        if (hasUrgent) {
            log.info("Exploration skipped for user {}: urgent(RED) task present.", userId);
            clearFlags(tasks);
            return tasks;
        }

        log.info("Exploration Mode activated for user: {}", userId);

        // 최근 lookbackDays일간의 완료 로그 조회
        LocalDateTime since = LocalDateTime.now(clock).minusDays(lookbackDays);
        List<UserActivityLog> completedLogs = userActivityLogRepository
                .findByUserIdAndTimestampAfterAndActivityType(userId, since, "COMPLETED");

        if (completedLogs.isEmpty()) {
            log.info("No completed logs in the last {} days for user {}. Aborting exploration mode.", lookbackDays, userId);
            clearFlags(tasks);
            return tasks;
        }

        // 카테고리별 COMPLETED 카운트
        Map<String, Long> categoryCounts = completedLogs.stream()
                .collect(Collectors.groupingBy(UserActivityLog::getCategory, Collectors.counting()));

        // 후보 카테고리 중 최근 완료 건수가 최소인 카테고리 선택
        Set<String> candidateCategories = tasks.stream()
                .map(TaskResponse::getCategory)
                .collect(Collectors.toSet());
        String targetCategory = candidateCategories.stream()
                .min((c1, c2) -> Long.compare(
                        categoryCounts.getOrDefault(c1, 0L),
                        categoryCounts.getOrDefault(c2, 0L)))
                .orElse(null);

        if (targetCategory != null) {
            TaskResponse pick = tasks.stream()
                    .filter(t -> targetCategory.equals(t.getCategory()))
                    .findFirst()
                    .orElse(null);

            if (pick != null) {
                double maxScore = tasks.stream().mapToDouble(TaskResponse::getPriorityScore).max().orElse(0.0);
                double tempScore = Math.round(Math.max(maxScore, minBaseScore) * boostFactor * 100.0) / 100.0;
                pick.setPriorityScore(tempScore);
                pick.setExploration(true);

                long completedInCategory = categoryCounts.getOrDefault(targetCategory, 0L);
                pick.setReason(String.format(
                        "최근 %d일 완료가 가장 적은 '%s' 카테고리 (완료 %d건) — 탐색 추천",
                        lookbackDays, targetCategory, completedInCategory));

                log.info("Selected task {} from category '{}' for exploration. Temporary score set to {}",
                        pick.getTaskId(), targetCategory, tempScore);

                // 탐색 대상을 최상단으로 재정렬
                tasks.sort((t1, t2) -> Double.compare(t2.getPriorityScore(), t1.getPriorityScore()));
            }
        }

        return tasks;
    }

    private static void clearFlags(List<TaskResponse> tasks) {
        for (TaskResponse task : tasks) {
            task.setExploration(false);
        }
    }
}
