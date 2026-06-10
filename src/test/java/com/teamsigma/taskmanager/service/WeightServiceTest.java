package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("WeightService 단위 테스트")
@SuppressWarnings("null")
class WeightServiceTest {

    @Mock
    private UserProfileRepository userProfileRepository;

    @InjectMocks
    private WeightService weightService;

    @Test
    @DisplayName("리셋: 드리프트한 가중치를 기본값(0.5/0.3/0.2)으로 되돌리고 저장한다")
    void resetWeights_restoresDefaultsAndSaves() {
        // given: 학습으로 W1이 0.9까지 오른 프로필
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.9, 0.07, 0.03);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));
        when(userProfileRepository.save(profile)).thenReturn(profile);

        // when
        UserProfile result = weightService.resetWeights(userId);

        // then
        assertThat(result.getW1()).isEqualTo(0.5);
        assertThat(result.getW2()).isEqualTo(0.3);
        assertThat(result.getW3()).isEqualTo(0.2);
        verify(userProfileRepository, times(1)).save(profile);
    }

    @Test
    @DisplayName("리셋: 프로필이 없으면 IllegalArgumentException, 저장하지 않는다")
    void resetWeights_throwsWhenProfileMissing() {
        // given
        Long userId = 99L;
        when(userProfileRepository.findById(userId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> weightService.resetWeights(userId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("99");
        verify(userProfileRepository, never()).save(any());
    }

    @Test
    @DisplayName("조회: 현재 가중치를 그대로 반환한다")
    void getWeights_returnsCurrent() {
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.6, 0.25, 0.15);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        UserProfile result = weightService.getWeights(userId);

        assertThat(result.getW1()).isEqualTo(0.6);
        assertThat(result.getW2()).isEqualTo(0.25);
        assertThat(result.getW3()).isEqualTo(0.15);
    }
}
