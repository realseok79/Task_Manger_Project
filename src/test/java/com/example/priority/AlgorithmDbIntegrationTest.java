package com.example.priority;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.AutoConfigureTestEntityManager;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = "scheduling.enabled=false")
@Transactional
@AutoConfigureTestEntityManager
class AlgorithmDbIntegrationTest {

    @Autowired
    private TestEntityManager em;

    @Autowired
    private AdaptiveWeightEngine adaptiveWeightEngine;

    @Autowired
    private PriorityService priorityService;

    @MockBean
    private Random mockRandom;

    @Test
    @DisplayName("시나리오 1 - 편식 패턴 감지 후 가중치 실제 반영")
    void scenario1_pickyPatternWeightAdjustment() {
        // Given: 유저 생성 (W1=0.5, W2=0.3, W3=0.2, newUser=false)
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.50, 0.30, 0.20);
        profile.setNewUser(false);
        em.persist(profile);

        LocalDateTime now = LocalDateTime.now();

        // 30개 활동 로그 삽입:
        // 1. 쉬운 작업 완료율 80% (15개 중 12개 완료, 3개 미완료/SNOOZED)
        //    (쉬운 작업: estimatedTime <= 30 && starRating <= 2)
        for (int i = 0; i < 12; i++) {
            em.persist(new UserActivityLog(userId, "COMPLETED", "DEV", 1, 20, now.minusMinutes(10 * i)));
        }
        for (int i = 0; i < 3; i++) {
            em.persist(new UserActivityLog(userId, "SNOOZED", "DEV", 1, 20, now.minusMinutes(10 * (i + 12))));
        }

        // 2. 중요 작업 SNOOZED 비율 60% (15개 중 9개 SNOOZED, 6개 COMPLETED)
        //    (중요 작업: starRating >= 4)
        for (int i = 0; i < 9; i++) {
            em.persist(new UserActivityLog(userId, "SNOOZED", "DEV", 5, 60, now.minusMinutes(10 * (i + 15))));
        }
        for (int i = 0; i < 6; i++) {
            em.persist(new UserActivityLog(userId, "COMPLETED", "DEV", 5, 60, now.minusMinutes(10 * (i + 24))));
        }

        em.flush();
        em.clear();

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();
        em.flush();
        em.clear();

        // Then: W1이 20% 이상 증가했는지 검증
        UserProfile updatedProfile = em.find(UserProfile.class, userId);
        assertThat(updatedProfile).isNotNull();
        // 원래 W1=0.50 -> 20% 이상 증가 시 > 0.5 * 1.2 = 0.60
        assertThat(updatedProfile.getW1()).isGreaterThan(0.50 * 1.20);
        assertThat(updatedProfile.getW1() + updatedProfile.getW2() + updatedProfile.getW3()).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.0001));
    }

    @Test
    @DisplayName("시나리오 2 - 정상 패턴에서 가중치 불변")
    void scenario2_normalPatternNoAdjustment() {
        // Given: 유저 생성 (W1=0.5, W2=0.3, W3=0.2, newUser=false)
        Long userId = 2L;
        UserProfile profile = new UserProfile(userId, 0.50, 0.30, 0.20);
        profile.setNewUser(false);
        em.persist(profile);

        LocalDateTime now = LocalDateTime.now();

        // 30개 활동 로그 삽입 (균형 잡힌 패턴으로 두 조건 모두 충족하지 않음):
        // 1. 쉬운 작업 완료율 40% (15개 중 6개 완료, 9개 SNOOZED -> <= 70% 이므로 조건 A 불충족)
        for (int i = 0; i < 6; i++) {
            em.persist(new UserActivityLog(userId, "COMPLETED", "DEV", 1, 20, now.minusMinutes(10 * i)));
        }
        for (int i = 0; i < 9; i++) {
            em.persist(new UserActivityLog(userId, "SNOOZED", "DEV", 1, 20, now.minusMinutes(10 * (i + 6))));
        }

        // 2. 중요 작업 SNOOZED 비율 40% (15개 중 6개 SNOOZED, 9개 COMPLETED -> <= 50% 이므로 조건 B 불충족)
        for (int i = 0; i < 6; i++) {
            em.persist(new UserActivityLog(userId, "SNOOZED", "DEV", 5, 60, now.minusMinutes(10 * (i + 15))));
        }
        for (int i = 0; i < 9; i++) {
            em.persist(new UserActivityLog(userId, "COMPLETED", "DEV", 5, 60, now.minusMinutes(10 * (i + 21))));
        }

        em.flush();
        em.clear();

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();
        em.flush();
        em.clear();

        // Then: 가중치 변경 없음 검증
        UserProfile updatedProfile = em.find(UserProfile.class, userId);
        assertThat(updatedProfile).isNotNull();
        assertThat(updatedProfile.getW1()).isEqualTo(0.50);
        assertThat(updatedProfile.getW2()).isEqualTo(0.30);
        assertThat(updatedProfile.getW3()).isEqualTo(0.20);
    }

    @Test
    @DisplayName("시나리오 3 - 탐색 모드 활성화 시 리스트 최상단 검증")
    void scenario3_explorationModeActive() {
        // Given
        Long userId = 3L;
        UserProfile profile = new UserProfile(userId, 0.50, 0.30, 0.20);
        profile.setNewUser(false);
        em.persist(profile);

        LocalDateTime now = LocalDateTime.now();

        // 최근 30일 완료 로그 설정: DEV 카테고리는 5번 완료, DOCS 카테고리는 1번 완료
        // (DOCS가 최소 완료 카테고리이므로 탐색 대상이 됨)
        for (int i = 0; i < 5; i++) {
            em.persist(new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(i + 1)));
        }
        em.persist(new UserActivityLog(userId, "COMPLETED", "DOCS", 3, 30, now.minusDays(10)));

        em.flush();
        em.clear();

        // 10개 작업 생성 (DEV 9개, DOCS 1개)
        // DEV 작업들의 우선순위 점수를 높게 설정하기 위해 starRating을 높게 설정하고, DOCS 작업은 낮게 설정
        List<Task> tasks = List.of(
                new Task(101L, "DEV Task 1", "DEV", now.plusDays(10), 5, 0),
                new Task(102L, "DEV Task 2", "DEV", now.plusDays(10), 5, 0),
                new Task(103L, "DEV Task 3", "DEV", now.plusDays(10), 5, 0),
                new Task(104L, "DEV Task 4", "DEV", now.plusDays(10), 5, 0),
                new Task(105L, "DEV Task 5", "DEV", now.plusDays(10), 5, 0),
                new Task(106L, "DEV Task 6", "DEV", now.plusDays(10), 5, 0),
                new Task(107L, "DEV Task 7", "DEV", now.plusDays(10), 5, 0),
                new Task(108L, "DEV Task 8", "DEV", now.plusDays(10), 5, 0),
                new Task(109L, "DEV Task 9", "DEV", now.plusDays(10), 5, 0),
                new Task(110L, "DOCS Task 1", "DOCS", now.plusDays(10), 1, 0) // 탐색 모드 타겟
        );

        // 탐색 모드 활성화 강제 (0.01 < 0.05)
        when(mockRandom.nextDouble()).thenReturn(0.01);

        // When
        List<TaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertThat(result).hasSize(10);
        // 반환 리스트 첫 번째가 DOCS 카테고리 작업인지 검증
        assertThat(result.get(0).getTaskId()).isEqualTo(110L);
        assertThat(result.get(0).getCategory()).isEqualTo("DOCS");
        assertThat(result.get(0).isExploration()).isTrue();
    }

    @Test
    @DisplayName("시나리오 4 - 신규 유저 콜드 스타트")
    void scenario4_coldStartNewUser() {
        // Given: 가입일자가 3일 전이고 newUser = true인 유저 (활동 로그 없음)
        Long userId = 4L;
        UserProfile profile = new UserProfile(userId, 0.50, 0.30, 0.20);
        profile.setNewUser(true);
        profile.setCreatedAt(LocalDateTime.now().minusDays(3));
        em.persist(profile);

        em.flush();
        em.clear();

        // When
        adaptiveWeightEngine.learnAndAdjustWeights();
        em.flush();
        em.clear();

        // Then: 가중치 변화 없음 및 newUser = true 유지
        UserProfile updatedProfile = em.find(UserProfile.class, userId);
        assertThat(updatedProfile).isNotNull();
        assertThat(updatedProfile.isNewUser()).isTrue();
        assertThat(updatedProfile.getW1()).isEqualTo(0.50);
        assertThat(updatedProfile.getW2()).isEqualTo(0.30);
        assertThat(updatedProfile.getW3()).isEqualTo(0.20);
    }
}
