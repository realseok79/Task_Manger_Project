package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class AdaptiveWeightEngine {

    private static final Logger log = LoggerFactory.getLogger(AdaptiveWeightEngine.class);

    private final UserActivityLogRepository activityLogRepository;
    private final UserProfileRepository userProfileRepository;

    public AdaptiveWeightEngine(UserActivityLogRepository activityLogRepository, UserProfileRepository userProfileRepository) {
        this.activityLogRepository = activityLogRepository;
        this.userProfileRepository = userProfileRepository;
    }

    @Scheduled(cron = "0 0 0 * * ?") // 매일 자정 자동 실행
    @Transactional
    public void learnAndAdjustWeights() {
        log.info("Starting AdaptiveWeightEngine scheduler...");

        LocalDateTime twentyFourHoursAgo = LocalDateTime.now().minusDays(1);
        List<UserActivityLog> logs = activityLogRepository.findByLoggedAtAfter(twentyFourHoursAgo);

        if (logs.isEmpty()) {
            log.info("No user activity logs found in the last 24 hours.");
            return;
        }

        // 유저별로 로그 분류
        Map<Long, List<UserActivityLog>> logsByUser = logs.stream()
                .collect(Collectors.groupingBy(UserActivityLog::getUserId));

        for (Map.Entry<Long, List<UserActivityLog>> entry : logsByUser.entrySet()) {
            Long userId = entry.getKey();
            List<UserActivityLog> userLogs = entry.getValue();

            // 편식 패턴 판정
            // 조건A: 예상 소요 30분 이하 + 중요도 낮은(starRating <= 2) 작업 완료율 > 70%
            List<UserActivityLog> lowEffortLogs = userLogs.stream()
                    .filter(l -> l.getEstimatedTime() <= 30 && l.getStarRating() <= 2)
                    .toList();

            boolean conditionA = false;
            if (!lowEffortLogs.isEmpty()) {
                long completedCount = lowEffortLogs.stream()
                        .filter(l -> "COMPLETED".equals(l.getActivityType()))
                        .count();
                double completionRate = (double) completedCount / lowEffortLogs.size();
                conditionA = completionRate > 0.70;
            }

            // 조건B: 중요도 높은(starRating >= 4) 작업의 SNOOZED 비율 > 50%
            List<UserActivityLog> highImportanceLogs = userLogs.stream()
                    .filter(l -> l.getStarRating() >= 4)
                    .toList();

            boolean conditionB = false;
            double snoozedRate = 0.0;
            if (!highImportanceLogs.isEmpty()) {
                long snoozedCount = highImportanceLogs.stream()
                        .filter(l -> "SNOOZED".equals(l.getActivityType()))
                        .count();
                snoozedRate = (double) snoozedCount / highImportanceLogs.size();
                conditionB = snoozedRate > 0.50;
            }

            // 조건A AND 조건B 동시 충족 시 편식 패턴 판정
            if (conditionA && conditionB) {
                log.info("Picky pattern detected for user: {}", userId);
                adjustUserProfileWeights(userId, snoozedRate);
            } else {
                log.info("User {} has a normal activity pattern.", userId);
            }
        }
        log.info("AdaptiveWeightEngine scheduler execution finished.");
    }

    private void adjustUserProfileWeights(Long userId, double snoozedRate) {
        userProfileRepository.findById(userId).ifPresent(profile -> {
            double w1 = profile.getW1();
            double w2 = profile.getW2();
            double w3 = profile.getW3();

            // boostRate는 SNOOZED 비율(0.50 ~ 1.00)에 비례하여 0.20 ~ 0.30 범위에서 계산
            // 선형 매핑 공식: 0.20 + (snoozedRate - 0.50) * (0.30 - 0.20) / (1.00 - 0.50)
            double boostRate = 0.20 + (snoozedRate - 0.50) * 0.20;
            boostRate = Math.max(0.20, Math.min(0.30, boostRate)); // 범위 안전장치

            // 편식 패턴 감지 시: W1 = W1 * (1 + boostRate)
            double newW1 = w1 * (1 + boostRate);
            
            // W1 상한선 설정 (W2, W3에 최소한의 가중치를 할당하여 합이 1.0이 되도록 보장)
            newW1 = Math.min(newW1, 0.90);

            double remainingWeight = 1.0 - newW1;
            double newW2;
            double newW3;

            if (w2 + w3 > 0.0) {
                newW2 = remainingWeight * (w2 / (w2 + w3));
                newW3 = remainingWeight * (w3 / (w2 + w3));
            } else {
                // 기존 W2, W3의 비율이 없는 경우 균등하게 나눔
                newW2 = remainingWeight / 2.0;
                newW3 = remainingWeight / 2.0;
            }

            profile.updateWeights(newW1, newW2, newW3);
            userProfileRepository.save(profile);

            log.info("Adjusted weights for user {}: W1={}(+{}%), W2={}, W3={}",
                    userId, String.format("%.4f", newW1), String.format("%.2f", boostRate * 100),
                    String.format("%.4f", newW2), String.format("%.4f", newW3));
        });
    }
}
