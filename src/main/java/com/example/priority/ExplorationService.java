package com.example.priority;

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

    private final UserActivityLogRepository userActivityLogRepository;
    private Random random = new Random();

    public ExplorationService(UserActivityLogRepository userActivityLogRepository) {
        this.userActivityLogRepository = userActivityLogRepository;
    }

    // 테스트에서 mock Random을 주입받기 위한 setter
    void setRandom(Random random) {
        this.random = random;
    }

    public List<TaskResponse> applyExplorationMode(Long userId, List<TaskResponse> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return tasks;
        }

        // 5% 확률로 탐색 모드 활성화
        if (random.nextDouble() < 0.05) {
            log.info("Exploration Mode activated for user: {}", userId);

            // 최근 30일간의 로그 조회
            LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
            List<UserActivityLog> completedLogs = userActivityLogRepository
                    .findByUserIdAndTimestampAfterAndActivityType(userId, thirtyDaysAgo, "COMPLETED");

            // 카테고리별 COMPLETED 카운트 집계
            Map<String, Long> categoryCounts = completedLogs.stream()
                    .collect(Collectors.groupingBy(UserActivityLog::getCategory, Collectors.counting()));

            // 후보 작업들의 카테고리 추출
            Set<String> candidateCategories = tasks.stream()
                    .map(TaskResponse::getCategory)
                    .collect(Collectors.toSet());

            // 후보 카테고리 중 최근 30일간 완료 건수가 최소인 카테고리 선택
            String targetCategory = candidateCategories.stream()
                    .min((cat1, cat2) -> {
                        long count1 = categoryCounts.getOrDefault(cat1, 0L);
                        long count2 = categoryCounts.getOrDefault(cat2, 0L);
                        return Long.compare(count1, count2);
                    })
                    .orElse(null);

            if (targetCategory != null) {
                // 해당 카테고리에 속하는 작업 중 1개 선택
                TaskResponse explorationTask = tasks.stream()
                        .filter(t -> targetCategory.equals(t.getCategory()))
                        .findFirst()
                        .orElse(null);

                if (explorationTask != null) {
                    // 리스트 최고점 찾기
                    double maxScore = tasks.stream()
                            .mapToDouble(TaskResponse::getScore)
                            .max()
                            .orElse(0.0);

                    // 임시 score 설정 (최고점 * 1.5, 최고점이 0일 경우 1.0 기준으로 1.5배 보장)
                    double tempScore = Math.max(maxScore, 1.0) * 1.5;
                    explorationTask.setScore(tempScore);
                    explorationTask.setExploration(true);

                    log.info("Selected task {} from category '{}' for exploration. Temporary score set to {}",
                            explorationTask.getTaskId(), targetCategory, tempScore);

                    // 탐색 모드 대상을 최상단에 올리기 위해 재정렬
                    tasks.sort((t1, t2) -> Double.compare(t2.getScore(), t1.getScore()));
                }
            }
        } else {
            // 활성화되지 않은 경우 모든 작업의 isExploration 플래그를 false로 설정
            for (TaskResponse task : tasks) {
                task.setExploration(false);
            }
        }

        return tasks;
    }
}
