package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * AdaptiveWeightEngine 트랜잭션 격리 통합 테스트 (실제 H2 + REQUIRES_NEW).
 *
 * @Transactional 을 쓰지 않는다: 유저별 갱신이 독립 트랜잭션(REQUIRES_NEW)에서 커밋되는지 확인하려면
 * 셋업 데이터가 실제 커밋되어 있어야 하고, 결과도 새 트랜잭션에서 읽어야 하기 때문이다.
 */
@SpringBootTest
@DisplayName("AdaptiveWeightEngine 트랜잭션 격리 통합 테스트")
class AdaptiveWeightEngineIntegrationTest {

    @Autowired private AdaptiveWeightEngine adaptiveWeightEngine;
    @Autowired private UserActivityLogRepository activityLogRepository;
    @Autowired private UserProfileRepository userProfileRepository;

    @Value("${app.scheduler.weight-update-cron}")
    private String schedulerCron;

    @BeforeEach
    @AfterEach
    void clean() {
        activityLogRepository.deleteAll();
        userProfileRepository.deleteAll();
    }

    /** 편식 패턴(conditionA && conditionB)을 만족하는 로그를 해당 유저로 커밋한다. */
    private void savePickyLogs(Long userId) {
        LocalDateTime now = LocalDateTime.now();
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 2, 15, now.minusHours(4)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 1, 30, now.minusHours(6)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(8)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)));
        activityLogRepository.save(new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)));
        activityLogRepository.save(new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5)));
    }

    @Test
    @DisplayName("한 유저(프로필 없음) 실패 시에도 다른 유저들의 가중치는 독립적으로 커밋된다")
    void should_commit_successful_users_when_one_user_fails() {
        // given: user 1, 3 은 프로필 보유, user 2 는 프로필 없음(→ EntityNotFoundException 유발). 셋 다 편식 로그.
        userProfileRepository.save(new UserProfile(1L, 0.40, 0.30, 0.30));
        userProfileRepository.save(new UserProfile(3L, 0.40, 0.30, 0.30));
        savePickyLogs(1L);
        savePickyLogs(2L); // 프로필 없음 → 이 유저만 실패
        savePickyLogs(3L);

        // when: 배치 실행(예외가 전파되면 안 된다)
        adaptiveWeightEngine.learnAndAdjustWeights();

        // then: user 1, 3 은 가중치가 상향 커밋됨(독립 트랜잭션 커밋 검증)
        UserProfile u1 = userProfileRepository.findById(1L).orElseThrow();
        UserProfile u3 = userProfileRepository.findById(3L).orElseThrow();
        assertThat(u1.getW1()).isCloseTo(0.4933, within(0.001));
        assertThat(u3.getW1()).isCloseTo(0.4933, within(0.001));

        // user 2 는 실패했지만 배치는 중단되지 않았고, 프로필은 여전히 없다(롤백/미반영 검증)
        assertThat(userProfileRepository.findById(2L)).isEmpty();
    }

    @Test
    @DisplayName("테스트 환경에서는 스케줄러 cron 이 '-'(비활성)로 설정되어 자동 실행되지 않는다")
    void should_not_run_scheduler_in_test_environment() {
        assertThat(schedulerCron).isEqualTo("-");
    }
}
