package com.example.priority;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest
@Transactional
class AdaptiveWeightEngineTest {

    @Autowired
    private AdaptiveWeightEngine adaptiveWeightEngine;

    @Autowired
    private UserActivityLogRepository activityLogRepository;

    @Autowired
    private UserProfileRepository userProfileRepository;

    @BeforeEach
    void setUp() {
        activityLogRepository.deleteAll();
        userProfileRepository.deleteAll();
    }

    @Test
    @DisplayName("편식 패턴 감지 케이스 - 조건A와 조건B를 만족하는 유저의 가중치를 SNOOZED 비율에 비례해 상향 조정한다")
    void learnAndAdjustWeights_PickyPattern() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        profile.setNewUser(false);
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
        profile.setNewUser(false);
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

        // 정상 패턴이므로 가중치는 변함없이 유지되어야 함
        assertEquals(0.40, updatedProfile.getW1(), 0.0001);
        assertEquals(0.30, updatedProfile.getW2(), 0.0001);
        assertEquals(0.30, updatedProfile.getW3(), 0.0001);
    }

    @Test
    @DisplayName("가입 3일차 신규 유저 테스트 - 가중치 변경 없음 및 newUser=true 유지")
    void learnAndAdjustWeights_NewUser_3Days() {
        // Given
        Long userId = 3L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        profile.setNewUser(true);
        profile.setCreatedAt(LocalDateTime.now().minusDays(3));
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        // 편식 패턴을 만족하도록 로그 구성
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 2, 15, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 30, now.minusHours(6)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(8)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then
        UserProfile updatedProfile = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updatedProfile);
        assertTrue(updatedProfile.isNewUser());
        assertEquals(0.40, updatedProfile.getW1(), 0.0001);
        assertEquals(0.30, updatedProfile.getW2(), 0.0001);
        assertEquals(0.30, updatedProfile.getW3(), 0.0001);
    }

    @Test
    @DisplayName("가입 8일차 신규 유저 테스트 - newUser=false로 전환 및 가중치 정상 업데이트")
    void learnAndAdjustWeights_NewUser_8Days() {
        // Given
        Long userId = 4L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        profile.setNewUser(true);
        profile.setCreatedAt(LocalDateTime.now().minusDays(8));
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        // 편식 패턴을 만족하도록 로그 구성
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 2, 15, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 30, now.minusHours(6)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(8)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then
        UserProfile updatedProfile = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updatedProfile);
        assertFalse(updatedProfile.isNewUser());
        // 가중치가 업데이트되었어야 함 (Picky Pattern과 동일)
        assertEquals(0.4933, updatedProfile.getW1(), 0.001);
        assertEquals(0.2533, updatedProfile.getW2(), 0.001);
        assertEquals(0.2533, updatedProfile.getW3(), 0.001);
    }

    @Test
    @DisplayName("마스터 패턴 - 중요작업 완료율이 높으면 부풀려진 W1을 기본값 쪽으로 낮춘다(양방향)")
    void learnAndAdjustWeights_MasterPattern_DecreasesW1() {
        // Given: 과거 boost로 W1이 0.70까지 부풀려진 유저
        Long userId = 5L;
        UserProfile profile = new UserProfile(userId, 0.70, 0.18, 0.12);
        profile.setNewUser(false);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        // 고중요(>=4) 완료율 4/5 = 80% (> 70%), SNOOZED 20% → master(편식 아님)
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 5, 90, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 5, 60, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 45, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 30, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(5)));

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();

        // Then: newW1 = 0.70 + (0.5 - 0.70)*0.30 = 0.64 (감소)
        UserProfile updated = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updated);
        assertEquals(0.64, updated.getW1(), 0.001);
        assertTrue(updated.getW1() < 0.70); // 양방향: W1이 내려간다
        // remaining 0.36을 0.18:0.12 = 0.6:0.4 비율로 → W2=0.216, W3=0.144
        assertEquals(0.216, updated.getW2(), 0.001);
        assertEquals(0.144, updated.getW3(), 0.001);
        assertEquals(1.0, updated.getW1() + updated.getW2() + updated.getW3(), 0.0001);
    }

    @Test
    @DisplayName("마스터 패턴이지만 W1이 이미 기본값(0.5) 이하이면 변경하지 않는다")
    void learnAndAdjustWeights_MasterPattern_AtDefault_NoChange() {
        Long userId = 6L;
        UserProfile profile = new UserProfile(userId, 0.50, 0.30, 0.20);
        profile.setNewUser(false);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 5, 90, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 60, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 30, now.minusHours(3)));

        adaptiveWeightEngine.learnAndAdjustWeights();

        UserProfile updated = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updated);
        assertEquals(0.50, updated.getW1(), 0.0001);
        assertEquals(0.30, updated.getW2(), 0.0001);
        assertEquals(0.20, updated.getW3(), 0.0001);
    }

    @Test
    @DisplayName("편식 패턴 극단값 - W1은 상한(0.90)을 넘지 않고 합은 1.0을 유지한다")
    void learnAndAdjustWeights_Avoider_W1CapAndSum() {
        Long userId = 7L;
        UserProfile profile = new UserProfile(userId, 0.85, 0.10, 0.05);
        profile.setNewUser(false);
        userProfileRepository.save(profile);

        LocalDateTime now = LocalDateTime.now();
        // 조건A: 쉬운·저중요 완료율 100%
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 2, 30, now.minusHours(3)));
        // 조건B: 고중요 SNOOZED 100% (snoozedRate=1.0 → boostRate=0.30)
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 90, now.minusHours(5)));

        adaptiveWeightEngine.learnAndAdjustWeights();

        // 0.85 * 1.30 = 1.105 → 상한 0.90으로 클램프
        UserProfile updated = userProfileRepository.findById(userId).orElse(null);
        assertNotNull(updated);
        assertEquals(0.90, updated.getW1(), 0.0001);
        assertEquals(1.0, updated.getW1() + updated.getW2() + updated.getW3(), 0.0001);
    }
}
