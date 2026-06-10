package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 유저 우선순위 가중치의 조회·수동 리셋(거버넌스) 책임.
 *
 * 야간 학습({@link com.teamsigma.taskmanager.priority.WeightUpdateDelegate})이 가중치를
 * 자동 조정/자기보정하는 반면, 이 서비스는 유저가 직접 기본값으로 되돌리는 override 경로를 제공한다.
 */
@Service
@RequiredArgsConstructor
@SuppressWarnings("null") // JPA findById(Long) 레거시 타입과 Eclipse null 분석기 불일치 — 런타임에는 안전
public class WeightService {

    private final UserProfileRepository userProfileRepository;

    @Transactional(readOnly = true)
    public UserProfile getWeights(Long userId) {
        return userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));
    }

    /** 가중치를 기본값(0.5/0.3/0.2)으로 되돌린다. 프로필이 없으면 IllegalArgumentException. */
    @Transactional
    public UserProfile resetWeights(Long userId) {
        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));
        profile.resetToDefault();
        return userProfileRepository.save(profile);
    }
}
