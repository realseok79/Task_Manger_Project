package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 단일 유저의 가중치 갱신만 책임지는 서비스.
 *
 * 왜 별도 Bean 인가: {@link AdaptiveWeightEngine} 가 같은 클래스 내에서
 * REQUIRES_NEW 메서드를 직접 호출하면 self-invocation 으로 Spring AOP 프록시를 우회해
 * 새 트랜잭션이 열리지 않는다. 호출자(Bean A)와 피호출자(Bean B)를 분리해야
 * 프록시를 통해 유저별 독립 트랜잭션이 보장된다.
 *
 * 가중치 계산 알고리즘은 기존 AdaptiveWeightEngine 의 로직을 그대로 이전한 것이며 변경하지 않았다.
 * (트랜잭션 경계: REQUIRES_NEW, 영속성: findById→orElseThrow / saveAndFlush 만 보강)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WeightUpdateDelegate {

    private final UserProfileRepository userProfileRepository;

    /**
     * 단일 유저의 24시간 행동 로그(userLogs)를 분석해 편식 패턴이면 가중치를 상향한다.
     * 독립 트랜잭션(REQUIRES_NEW)으로 실행되어, 이 유저의 실패가 다른 유저 커밋을 롤백시키지 않는다.
     * 예외는 이 메서드에서 삼키지 않고 호출자로 전파한다(호출자가 per-user try-catch 로 처리).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateWeightForUser(Long userId, List<UserActivityLog> userLogs) {
        log.debug("[WeightUpdate] START userId={}", userId);

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

        log.info("[WeightUpdate] COMMIT userId={}", userId);
    }

    private void adjustUserProfileWeights(Long userId, double snoozedRate) {
        // 가중치 데이터가 없으면 건너뛸 대상이므로 예외로 전파(호출자가 warn 후 다음 유저로 진행).
        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("userId=" + userId + " 에 해당하는 가중치 데이터 없음"));

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
        // REQUIRES_NEW 커밋 전 flush 보장: 커밋 시점의 DB 상태가 즉시 반영되어 다음 트랜잭션에서 읽을 수 있다.
        userProfileRepository.saveAndFlush(profile);

        log.info("Adjusted weights for user {}: W1={}(+{}%), W2={}, W3={}",
                userId, String.format("%.4f", newW1), String.format("%.2f", boostRate * 100),
                String.format("%.4f", newW2), String.format("%.4f", newW3));
    }
}
