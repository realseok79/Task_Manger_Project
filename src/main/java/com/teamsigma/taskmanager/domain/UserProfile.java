package com.teamsigma.taskmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "user_profiles")
@Getter
@NoArgsConstructor
public class UserProfile {

    /** 기본 가중치(콜드스타트·수동 리셋 기준): 중요도/긴급도/지연 = 0.5/0.3/0.2, 합 1.0. */
    public static final double DEFAULT_W1 = 0.5;
    public static final double DEFAULT_W2 = 0.3;
    public static final double DEFAULT_W3 = 0.2;

    @Id
    private Long userId;

    private double w1;
    private double w2;
    private double w3;

    public UserProfile(Long userId, double w1, double w2, double w3) {
        this.userId = userId;
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
    }

    public void updateWeights(double w1, double w2, double w3) {
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
    }

    /** 학습으로 드리프트한 가중치를 기본값으로 되돌린다(유저 override·거버넌스). */
    public void resetToDefault() {
        updateWeights(DEFAULT_W1, DEFAULT_W2, DEFAULT_W3);
    }
}
