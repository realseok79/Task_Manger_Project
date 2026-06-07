package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 매일 자정(또는 설정된 주기) 최근 24시간 행동 로그를 학습해 유저별 가중치를 조정하는 배치.
 *
 * 트랜잭션 전략: 이 메서드 자체는 트랜잭션이 없다. 유저별 갱신은 {@link WeightUpdateDelegate}
 * (REQUIRES_NEW)에 위임하여 한 유저의 실패가 전체 배치를 롤백시키지 않도록 격리한다.
 * 실패는 유저 단위로 catch 하여 로그를 남기고 다음 유저로 진행한다.
 */
@Component
public class AdaptiveWeightEngine {

    private static final Logger log = LoggerFactory.getLogger(AdaptiveWeightEngine.class);

    private static final long SLOW_USER_THRESHOLD_MS = 500L;

    private final UserActivityLogRepository activityLogRepository;
    private final WeightUpdateDelegate weightUpdateDelegate;

    public AdaptiveWeightEngine(UserActivityLogRepository activityLogRepository,
                                WeightUpdateDelegate weightUpdateDelegate) {
        this.activityLogRepository = activityLogRepository;
        this.weightUpdateDelegate = weightUpdateDelegate;
    }

    // cron 은 외부화: 미설정 시 SpEL 기본값(매일 자정)으로 동작, 환경변수 APP_SCHEDULER_WEIGHT_UPDATE_CRON 로 override.
    // 테스트 환경에서는 "-"(Scheduled.CRON_DISABLED)로 설정하여 자동 실행을 비활성화한다.
    @Scheduled(cron = "${app.scheduler.weight-update-cron:0 0 0 * * ?}")
    public void learnAndAdjustWeights() {
        Instant batchStart = Instant.now();

        LocalDateTime twentyFourHoursAgo = LocalDateTime.now().minusDays(1);
        List<UserActivityLog> logs = activityLogRepository.findByLoggedAtAfter(twentyFourHoursAgo);

        if (logs.isEmpty()) {
            log.info("[AdaptiveWeight] 최근 24시간 행동 로그 없음. 배치 종료.");
            return;
        }

        // 유저별로 로그 분류
        Map<Long, List<UserActivityLog>> logsByUser = logs.stream()
                .collect(Collectors.groupingBy(UserActivityLog::getUserId));

        int targetCount = logsByUser.size();
        log.info("[AdaptiveWeight] 배치 시작. 대상 유저 수={}", targetCount);

        int successCount = 0;
        int failCount = 0;

        for (Map.Entry<Long, List<UserActivityLog>> entry : logsByUser.entrySet()) {
            Long userId = entry.getKey();
            List<UserActivityLog> userLogs = entry.getValue();
            try {
                long start = System.currentTimeMillis();
                // 별도 Bean 호출(프록시 경유) → REQUIRES_NEW 독립 트랜잭션. self-invocation 아님.
                weightUpdateDelegate.updateWeightForUser(userId, userLogs);
                long elapsed = System.currentTimeMillis() - start;
                if (elapsed > SLOW_USER_THRESHOLD_MS) {
                    log.warn("[AdaptiveWeight] userId={} 처리시간 {}ms 초과", userId, elapsed);
                }
                successCount++;
            } catch (EntityNotFoundException e) {
                // 데이터 없음 → 건너뜀
                log.warn("[AdaptiveWeight] userId={} 가중치 데이터 없음, 건너뜀. reason={}", userId, e.getMessage());
                failCount++;
            } catch (DataIntegrityViolationException e) {
                // 데이터 정합성 오류 → 알림 필요
                log.error("[AdaptiveWeight] userId={} 데이터 정합성 오류, 건너뜀. reason={}", userId, e.getMessage(), e);
                failCount++;
            } catch (CannotAcquireLockException e) {
                // 락 충돌 → 재시도 없이 건너뜀
                log.error("[AdaptiveWeight] userId={} 락 충돌, 재시도 없이 건너뜀. reason={}", userId, e.getMessage(), e);
                failCount++;
            } catch (Exception e) {
                // 그 외 예외 → 건너뜀. 절대 전체 배치를 중단하지 않는다.
                log.error("[AdaptiveWeight] userId={} 업데이트 실패, 건너뜀. reason={}", userId, e.getMessage(), e);
                failCount++;
            }
        }

        long totalMs = Duration.between(batchStart, Instant.now()).toMillis();
        log.info("[AdaptiveWeight] 배치 완료. 총={} 성공={} 실패={} 소요시간={}ms",
                targetCount, successCount, failCount, totalMs);

        // 실패율 10% 초과 시 경보
        if (failCount * 10 > targetCount) {
            log.warn("[AdaptiveWeight] 실패율 {}% 초과. 운영팀 확인 필요.", failCount * 100 / targetCount);
        }
    }
}
