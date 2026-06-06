package com.example.priority;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_profiles")
public class UserProfile {

    @Id
    private Long userId;

    private double w1 = 0.5;
    private double w2 = 0.3;
    private double w3 = 0.2;

    private boolean newUser = true;
    private LocalDateTime createdAt;

    /** true면 자동 학습(AdaptiveWeightEngine)이 가중치를 건드리지 않는다(사용자 고정). */
    private boolean weightsLocked = false;

    public UserProfile() {
    }

    public UserProfile(Long userId, double w1, double w2, double w3) {
        this.userId = userId;
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
    }

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
    }

    public Long getUserId() {
        return userId;
    }

    public double getW1() {
        return w1;
    }

    public double getW2() {
        return w2;
    }

    public double getW3() {
        return w3;
    }

    public boolean isNewUser() {
        return newUser;
    }

    public void setNewUser(boolean newUser) {
        this.newUser = newUser;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public void updateWeights(double w1, double w2, double w3) {
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
    }

    public boolean isWeightsLocked() {
        return weightsLocked;
    }

    public void setWeightsLocked(boolean weightsLocked) {
        this.weightsLocked = weightsLocked;
    }

    /** 가중치를 기본값(0.5/0.3/0.2)으로 되돌린다(드리프트 리셋). */
    public void resetToDefaultWeights() {
        updateWeights(0.5, 0.3, 0.2);
    }
}

