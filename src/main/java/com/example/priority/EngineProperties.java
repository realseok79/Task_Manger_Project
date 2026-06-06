package com.example.priority;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 엔진 튜닝 파라미터 외부화(거버넌스 — 설정화).
 *
 * application.properties에서 {@code engine.learning.*}, {@code engine.exploration.*}로 재정의 가능.
 * 미설정 시 아래 기본값(현행 동작과 동일)이 적용된다.
 */
@Component
@ConfigurationProperties(prefix = "engine")
public class EngineProperties {

    private final Learning learning = new Learning();
    private final Exploration exploration = new Exploration();

    public Learning getLearning() {
        return learning;
    }

    public Exploration getExploration() {
        return exploration;
    }

    /** 적응 학습(AdaptiveWeightEngine) 파라미터. */
    public static class Learning {
        private double defaultW1 = 0.5;
        private double w1Cap = 0.90;
        private double recoveryRate = 0.30;
        private double easyCompletionThreshold = 0.70;
        private double highImportanceSnoozeThreshold = 0.50;
        private double masterCompletionThreshold = 0.70;

        public double getDefaultW1() { return defaultW1; }
        public void setDefaultW1(double v) { this.defaultW1 = v; }
        public double getW1Cap() { return w1Cap; }
        public void setW1Cap(double v) { this.w1Cap = v; }
        public double getRecoveryRate() { return recoveryRate; }
        public void setRecoveryRate(double v) { this.recoveryRate = v; }
        public double getEasyCompletionThreshold() { return easyCompletionThreshold; }
        public void setEasyCompletionThreshold(double v) { this.easyCompletionThreshold = v; }
        public double getHighImportanceSnoozeThreshold() { return highImportanceSnoozeThreshold; }
        public void setHighImportanceSnoozeThreshold(double v) { this.highImportanceSnoozeThreshold = v; }
        public double getMasterCompletionThreshold() { return masterCompletionThreshold; }
        public void setMasterCompletionThreshold(double v) { this.masterCompletionThreshold = v; }
    }

    /** 탐색(ExplorationService) 파라미터. */
    public static class Exploration {
        private double probability = 0.05;
        private int lookbackDays = 30;
        private double boostFactor = 1.5;
        private double minBaseScore = 1.0;

        public double getProbability() { return probability; }
        public void setProbability(double v) { this.probability = v; }
        public int getLookbackDays() { return lookbackDays; }
        public void setLookbackDays(int v) { this.lookbackDays = v; }
        public double getBoostFactor() { return boostFactor; }
        public void setBoostFactor(double v) { this.boostFactor = v; }
        public double getMinBaseScore() { return minBaseScore; }
        public void setMinBaseScore(double v) { this.minBaseScore = v; }
    }
}
