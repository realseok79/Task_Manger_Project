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
}
