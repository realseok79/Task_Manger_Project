package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("WeightUpdateDelegate 단위 테스트")
class WeightUpdateDelegateTest {

    @Mock
    private UserProfileRepository userProfileRepository;

    @InjectMocks
    private WeightUpdateDelegate weightUpdateDelegate;

    /** conditionA(저난이도 완료율 75%) AND conditionB(고중요도 SNOOZED 66.7%) 를 만족하는 편식 로그. */
    private List<UserActivityLog> pickyLogs(Long userId) {
        LocalDateTime now = LocalDateTime.now();
        return List.of(
                new UserActivityLog(userId, "COMPLETED", 1, 20, now.minusHours(2)),
                new UserActivityLog(userId, "COMPLETED", 2, 15, now.minusHours(4)),
                new UserActivityLog(userId, "COMPLETED", 1, 30, now.minusHours(6)),
                new UserActivityLog(userId, "SNOOZED", 2, 10, now.minusHours(8)),
                new UserActivityLog(userId, "SNOOZED", 4, 60, now.minusHours(1)),
                new UserActivityLog(userId, "SNOOZED", 5, 120, now.minusHours(3)),
                new UserActivityLog(userId, "COMPLETED", 4, 90, now.minusHours(5))
        );
    }

    @Test
    @DisplayName("정상 userId(편식 패턴) → saveAndFlush 1회 호출, 예외 없음")
    void should_commit_successfully_when_valid_userId_given() {
        // given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        // when
        weightUpdateDelegate.updateWeightForUser(userId, pickyLogs(userId));

        // then
        verify(userProfileRepository, times(1)).saveAndFlush(profile);
    }

    @Test
    @DisplayName("프로필 없음 → EntityNotFoundException, 메시지에 userId 포함")
    void should_throw_EntityNotFoundException_when_userId_not_found() {
        // given
        Long userId = 99L;
        when(userProfileRepository.findById(userId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> weightUpdateDelegate.updateWeightForUser(userId, pickyLogs(userId)))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("99");
        verify(userProfileRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("내부 DataIntegrityViolationException → 삼키지 않고 호출자로 전파")
    void should_propagate_exception_without_swallowing() {
        // given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.40, 0.30, 0.30);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));
        when(userProfileRepository.saveAndFlush(profile))
                .thenThrow(new DataIntegrityViolationException("제약 위반"));

        // when / then
        assertThatThrownBy(() -> weightUpdateDelegate.updateWeightForUser(userId, pickyLogs(userId)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
