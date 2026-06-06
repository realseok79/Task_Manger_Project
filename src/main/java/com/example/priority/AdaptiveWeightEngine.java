package com.example.priority;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Component
public class AdaptiveWeightEngine {

    private static final Logger log = LoggerFactory.getLogger(AdaptiveWeightEngine.class);

    // 가중치 기본값/한도 (항목6 설정화의 사전작업으로 named constant화)
    static final double DEFAULT_W1 = 0.5;
    static final double W1_CAP = 0.90;
    /** MASTER 패턴에서 W1을 기본값 쪽으로 끌어당기는 비율(자기보정 강도). */
    static final double RECOVERY_RATE = 0.30;
    /** 쉬운·저중요 작업 완료율이 이 값을 넘으면 편식 조건A 성립. */
    static final double EASY_COMPLETION_THRESHOLD = 0.70;
    /** 고중요 작업 SNOOZED 비율이 이 값을 넘으면 편식 조건B 성립. */
    static final double HIGH_IMPORTANCE_SNOOZE_THRESHOLD = 0.50;
    /** 고중요 작업 완료율이 이 값을 넘으면 '잘 처리하는' 마스터로 본다. */
    static final double MASTER_COMPLETION_THRESHOLD = 0.70;

    /** 학습이 감지하는 사용자 행동 유형. */
    enum Archetype { IMPORTANCE_AVOIDER, IMPORTANCE_MASTER, NEUTRAL }

    private final UserActivityLogRepository activityLogRepository;
    private final UserProfileRepository userProfileRepository;
    private final Clock clock;

    public AdaptiveWeightEngine(UserActivityLogRepository activityLogRepository, UserProfileRepository userProfileRepository, Clock clock) {
        this.activityLogRepository = activityLogRepository;
        this.userProfileRepository = userProfileRepository;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 0 * * ?") // 매일 자정 자동 실행
    @Transactional
    public void learnAndAdjustWeights() {
        log.info("Starting AdaptiveWeightEngine scheduler...");

        // 7일 경과 신규 유저 벌크 전환
        LocalDateTime threshold = LocalDateTime.now(clock).minusDays(7);
        int transitionedCount = userProfileRepository.bulkTransitionNewUsers(threshold);
        if (transitionedCount > 0) {
            log.info("Transitioned {} users from newUser=true to false", transitionedCount);
        }

        LocalDateTime twentyFourHoursAgo = LocalDateTime.now(clock).minusDays(1);
        List<UserActivityLog> logs = activityLogRepository.findByTimestampAfter(twentyFourHoursAgo);

        if (logs.isEmpty()) {
            log.info("No user activity logs found in the last 24 hours.");
            return;
        }

        // 유저별로 로그 분류
        Map<Long, List<UserActivityLog>> logsByUser = logs.stream()
                .collect(Collectors.groupingBy(UserActivityLog::getUserId));

        for (Map.Entry<Long, List<UserActivityLog>> entry : logsByUser.entrySet()) {
            Long userId = entry.getKey();
            if (userId == null) {
                continue;
            }

            Optional<UserProfile> profileOpt = userProfileRepository.findById(userId);
            if (profileOpt.map(UserProfile::isNewUser).orElse(false)) {
                log.info("User {} is a new user. Skipping weight adjustment.", userId);
                continue;
            }
            if (profileOpt.map(UserProfile::isWeightsLocked).orElse(false)) {
                log.info("User {} has locked weights. Skipping weight adjustment.", userId);
                continue;
            }

            List<UserActivityLog> userLogs = entry.getValue();

            // 쉬운·저중요(소요 30분 이하 & starRating <= 2) 작업 완료율 → 조건A
            List<UserActivityLog> lowEffortLogs = userLogs.stream()
                    .filter(l -> l.getEstimatedTime() <= 30 && l.getStarRating() <= 2)
                    .toList();
            boolean conditionA = !lowEffortLogs.isEmpty()
                    && rateOf(lowEffortLogs, "COMPLETED") > EASY_COMPLETION_THRESHOLD;

            // 고중요(starRating >= 4) 작업의 SNOOZED/COMPLETED 비율
            List<UserActivityLog> highImportanceLogs = userLogs.stream()
                    .filter(l -> l.getStarRating() >= 4)
                    .toList();
            double snoozedRate = rateOf(highImportanceLogs, "SNOOZED");
            double completionRate = rateOf(highImportanceLogs, "COMPLETED");
            boolean conditionB = !highImportanceLogs.isEmpty()
                    && snoozedRate > HIGH_IMPORTANCE_SNOOZE_THRESHOLD;

            Archetype archetype = classify(conditionA, conditionB, highImportanceLogs.isEmpty(), completionRate);
            switch (archetype) {
                case IMPORTANCE_AVOIDER -> {
                    log.info("Importance-avoider (picky) pattern detected for user: {}", userId);
                    boostImportance(userId, snoozedRate);
                }
                case IMPORTANCE_MASTER -> {
                    log.info("Importance-master pattern detected for user: {}", userId);
                    recoverImportanceTowardDefault(userId);
                }
                case NEUTRAL -> log.info("User {} has a normal activity pattern.", userId);
            }
        }
        log.info("AdaptiveWeightEngine scheduler execution finished.");
    }

    /**
     * 행동 유형 분류.
     * <ul>
     *   <li>AVOIDER: 쉬운 건 완료(A) + 중요한 건 미룸(B) → 중요도 가중치 부족 신호</li>
     *   <li>MASTER: 중요 작업을 높은 비율로 완료 → 중요도 boost가 더는 불필요</li>
     *   <li>NEUTRAL: 뚜렷한 신호 없음 → 변경하지 않음(기존 "정상=불변" 계약)</li>
     * </ul>
     */
    private Archetype classify(boolean conditionA, boolean conditionB,
                               boolean highImportanceEmpty, double highStarCompletionRate) {
        if (conditionA && conditionB) {
            return Archetype.IMPORTANCE_AVOIDER;
        }
        if (!highImportanceEmpty && highStarCompletionRate > MASTER_COMPLETION_THRESHOLD) {
            return Archetype.IMPORTANCE_MASTER;
        }
        return Archetype.NEUTRAL;
    }

    private static double rateOf(List<UserActivityLog> logs, String activityType) {
        if (logs.isEmpty()) {
            return 0.0;
        }
        long count = logs.stream().filter(l -> activityType.equals(l.getActivityType())).count();
        return (double) count / logs.size();
    }

    /** IMPORTANCE_AVOIDER: 중요 작업을 피하는 유저 → W1을 SNOOZED 비율에 비례해 상향(↑). */
    private void boostImportance(@NonNull Long userId, double snoozedRate) {
        userProfileRepository.findById(userId).ifPresent(profile -> {
            double w1 = profile.getW1();
            double w2 = profile.getW2();
            double w3 = profile.getW3();

            // boostRate: SNOOZED 비율(0.50~1.00)에 선형 비례하여 0.20~0.30
            double boostRate = 0.20 + (snoozedRate - 0.50) * 0.20;
            boostRate = Math.max(0.20, Math.min(0.30, boostRate));

            double newW1 = Math.min(w1 * (1 + boostRate), W1_CAP);
            double[] redistributed = splitRemaining(1.0 - newW1, w2, w3);
            saveWeights(profile, newW1, redistributed[0], redistributed[1]);

            log.info("Boosted W1 for user {} (avoider): W1={} (+{}%)",
                    userId, fmt(newW1), String.format("%.2f", boostRate * 100));
        });
    }

    /**
     * IMPORTANCE_MASTER: 중요 작업을 잘 처리하는 유저 → 과거 boost가 낡았으면 W1을 기본값 쪽으로 회복(↓).
     * 한 방향(증가)만 하던 기존 학습에 양방향(감소) 자기보정을 추가한다. W1이 기본값 이하면 변경 없음.
     */
    private void recoverImportanceTowardDefault(@NonNull Long userId) {
        userProfileRepository.findById(userId).ifPresent(profile -> {
            double w1 = profile.getW1();
            if (w1 <= DEFAULT_W1) {
                log.info("User {} is a master but W1({}) already at/below default. No change.", userId, fmt(w1));
                return;
            }
            double w2 = profile.getW2();
            double w3 = profile.getW3();

            double newW1 = w1 + (DEFAULT_W1 - w1) * RECOVERY_RATE; // 기본값 쪽으로 당김
            double[] redistributed = splitRemaining(1.0 - newW1, w2, w3);
            saveWeights(profile, newW1, redistributed[0], redistributed[1]);

            log.info("Recovered W1 toward default for user {} (master): W1 {} -> {}",
                    userId, fmt(w1), fmt(newW1));
        });
    }

    /** 남은 가중치(remaining)를 기존 W2:W3 비율로 나눈다(비율이 없으면 균등). 합은 항상 1.0 유지. */
    private static double[] splitRemaining(double remaining, double w2, double w3) {
        if (w2 + w3 > 0.0) {
            return new double[]{ remaining * (w2 / (w2 + w3)), remaining * (w3 / (w2 + w3)) };
        }
        return new double[]{ remaining / 2.0, remaining / 2.0 };
    }

    private void saveWeights(UserProfile profile, double w1, double w2, double w3) {
        profile.updateWeights(w1, w2, w3);
        userProfileRepository.save(profile);
    }

    private static String fmt(double d) {
        return String.format("%.4f", d);
    }

    // ── 거버넌스: 사용자 통제(리셋/락) ───────────────────────────────

    /** 가중치를 기본값(0.5/0.3/0.2)으로 되돌린다. 자동 학습 드리프트를 사용자가 취소. */
    @Transactional
    public void resetWeights(Long userId) {
        userProfileRepository.findById(userId).ifPresent(profile -> {
            profile.resetToDefaultWeights();
            userProfileRepository.save(profile);
            log.info("Reset weights to default for user {}", userId);
        });
    }

    /** 가중치 자동 학습을 잠그거나 푼다. 잠그면 학습 스케줄러가 해당 유저를 건너뛴다. */
    @Transactional
    public void setWeightsLocked(Long userId, boolean locked) {
        userProfileRepository.findById(userId).ifPresent(profile -> {
            profile.setWeightsLocked(locked);
            userProfileRepository.save(profile);
            log.info("Set weightsLocked={} for user {}", locked, userId);
        });
    }
}
