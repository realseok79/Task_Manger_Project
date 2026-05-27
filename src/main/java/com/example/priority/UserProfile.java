package com.example.priority;

public class UserProfile {
    private final double w1;
    private final double w2;
    private final double w3;

    public UserProfile(double w1, double w2, double w3) {
        this.w1 = w1;
        this.w2 = w2;
        this.w3 = w3;
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
}
