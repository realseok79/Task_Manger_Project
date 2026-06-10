package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * NOTE: 이 테스트는 @Transactional 을 쓰지 않는다.
 * 가중치 갱신이 WeightUpdateDelegate(REQUIRES_NEW)의 독립 트랜잭션에서 수행되므로,
 * 테스트 트랜잭션 안에서 미커밋 상태로 준비한 데이터는 새 트랜잭션에서 보이지 않는다.
 * 따라서 셋업 데이터를 실제 커밋하고, @BeforeEach/@AfterEach 에서 직접 정리한다.
 */
@SpringBootTest
class AdaptiveWeightEngineTest {

    @Autowired
    private AdaptiveWeightEngine adaptiveWeightEngine;

    @Autowired
    private UserActivityLogRepository activityLogRepository;

    @Autowired
    private UserProfileRepository userProfileRepository;

    @BeforeEach
    @AfterEach
    void clean() {
        activityLogRepository.deleteAll();
        userProfileRepository.deleteAll();
    }

    @Test
    @DisplayName("편식 패턴 감지 케이스 - 조건A와 조건B를 만족하는 유저의 가중치를 SNOOZED 비율에 비례해 상향 조정한다")
    void learnAndAdjustWeights_PickyPattern() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();

        // 조건A 만족: 예상소요 30분 이하 + 중요도 낮은(<=2) 완료율 = 3/4 = 75% (> 70%)
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 2, 15, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 30, now.minusHours(6)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(8)));

        // 조건B 만족: 중요도 높은(>=4) 작업 SNOOZED 비율 = 2/3 = 66.67% (> 50%)
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then
        UserProfile updatedProfile = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updatedProfile);

        // 예상 수치 검증:
        // snoozedRate = 2.0 / 3.0 = 0.666667...
        // boostRate = 0.20 + (0.666667 - 0.50) * 0.20 = 0.233333...
        // newW1 = 0.40 * (1 + 0.233333) = 0.493333...
        // remainingWeight = 1.0 - 0.493333 = 0.506667
        // newW2 = 0.506667 * (0.30 / 0.60) = 0.253333
        // newW3 = 0.506667 * (0.30 / 0.60) = 0.253333
        assertEquals(0.4933, updatedProfile.getW1(), 0.001);
        assertEquals(0.2533, updatedProfile.getW2(), 0.001);
        assertEquals(0.2533, updatedProfile.getW3(), 0.001);
        assertEquals(1.0, updatedProfile.getW1() + updatedProfile.getW2() + updatedProfile.getW3(), 0.0001);
    }

    @Test
    @DisplayName("정상 패턴 케이스 - 조건A 완료율이 70% 이하인 유저는 가중치를 조정하지 않는다")
    void learnAndAdjustWeights_NormalPattern() {
        // Given
        Long userId = 2L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();

        // 조건A 만족 안함: 예상소요 30분 이하 + 중요도 낮은(<=2) 완료율 = 1/2 = 50% (<= 70%)
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(4)));

        // 조건B 만족: 중요도 높은(>=4) 작업 SNOOZED 비율 = 2/3 = 66.67%
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then
        UserProfile updatedProfile = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updatedProfile);

        // 정상 패턴이고 W1이 기준선(0.5) 이하이므로 가중치는 변함없이 유지되어야 함
        assertEquals(0.40, updatedProfile.getW1(), 0.0001);
        assertEquals(0.30, updatedProfile.getW2(), 0.0001);
        assertEquals(0.30, updatedProfile.getW3(), 0.0001);
    }

    @Test
    @DisplayName("자기보정 케이스 - 정상 패턴이고 W1이 기준선(0.5)보다 높으면 W1을 한 스텝 기준선으로 되돌린다")
    void learnAndAdjustWeights_DecayWhenNormalAndBoosted() {
        // Given: 과거 부스트로 W1=0.70까지 오른 유저
        Long userId = 3L;
        UserProfile profile = new UserProfile(userId, 0.70, 0.15, 0.15);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        // 정상 패턴(conditionA 미충족: 저난이도·저중요 완료율 1/2 = 50% ≤ 70%, 고중요 로그 없음)
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(4)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then: 0.70 → 0.65, 남은 0.35를 기존 1:1 비율로 재분배 → 0.175 / 0.175
        UserProfile updated = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updated);
        assertEquals(0.65, updated.getW1(), 0.0001);
        assertEquals(0.175, updated.getW2(), 0.0001);
        assertEquals(0.175, updated.getW3(), 0.0001);
    }
}
