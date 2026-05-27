package com.example.priority;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_profiles")
public class UserProfile {

    @Id
    private Long userId;

    private double w1;
    private double w2;
    private double w3;

    public UserProfile() {
    }

    public UserProfile(Long userId, double w1, double w2, double w3) {
        this.userId = userId;
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
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

    public void updateWeights(double w1, double w2, double w3) {
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
    }
}
