package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.CannotAcquireLockException;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AdaptiveWeightEngine 배치 회복탄력성 단위 테스트.
 *
 * 한 유저의 예외가 전체 배치를 중단시키지 않는지(try-catch + 다음 유저 진행)를 검증한다.
 * 여기서는 delegate 를 mock 으로 두어 예외 주입만 한다(실제 트랜잭션 경계 검증은 통합 테스트가 담당).
 * 참고: @SpyBean 으로 실제 delegate 를 감싸면 Mockito spy 가 Spring 트랜잭션 프록시를 우회해
 * REQUIRES_NEW 가 무력화되므로, 회복탄력성은 mock 으로, 격리는 통합 테스트로 분리해 검증한다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AdaptiveWeightEngine 배치 회복탄력성 단위 테스트")
class AdaptiveWeightEngineUnitTest {

    @Mock
    private UserActivityLogRepository activityLogRepository;

    @Mock
    private WeightUpdateDelegate weightUpdateDelegate;

    @InjectMocks
    private AdaptiveWeightEngine adaptiveWeightEngine;

    private UserActivityLog logFor(Long userId) {
        return new UserActivityLog(userId, "COMPLETED", 1, 20, LocalDateTime.now().minusHours(1));
    }

    @Test
    @DisplayName("한 유저가 CannotAcquireLockException → 나머지 유저는 정상 처리, 배치 중단 없음")
    void should_continue_batch_after_lock_exception() {
        // given: 유저 1,2,3 의 로그. 유저 2는 락 충돌 발생.
        when(activityLogRepository.findByLoggedAtAfter(any()))
                .thenReturn(List.of(logFor(1L), logFor(2L), logFor(3L)));
        doThrow(new CannotAcquireLockException("lock conflict"))
                .when(weightUpdateDelegate).updateWeightForUser(eq(2L), anyList());

        // when / then: 예외가 호출자로 전파되지 않는다.
        assertThatCode(() -> adaptiveWeightEngine.learnAndAdjustWeights()).doesNotThrowAnyException();

        // then: 모든 유저에 대해 시도되었다(2번에서 멈추지 않음).
        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(1L), anyList());
        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(2L), anyList());
        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(3L), anyList());
    }

    @Test
    @DisplayName("한 유저가 RuntimeException → 나머지 유저는 정상 처리, 배치 중단 없음")
    void should_continue_batch_after_runtime_exception() {
        // given
        when(activityLogRepository.findByLoggedAtAfter(any()))
                .thenReturn(List.of(logFor(1L), logFor(2L), logFor(3L)));
        doThrow(new RuntimeException("boom"))
                .when(weightUpdateDelegate).updateWeightForUser(eq(1L), anyList());

        // when / then
        assertThatCode(() -> adaptiveWeightEngine.learnAndAdjustWeights()).doesNotThrowAnyException();

        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(1L), anyList());
        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(2L), anyList());
        verify(weightUpdateDelegate, times(1)).updateWeightForUser(eq(3L), anyList());
    }
}
