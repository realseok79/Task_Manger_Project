package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;

/**
 * 스코어링 결과 DTO(엔진 내부/우선순위 응답용).
 *
 * 점수(score)·탐색(isExploration) 외에, 신뢰·설명을 위한 신호를 함께 싣는다:
 * urgencyLevel(단일 진실 색), reason(사유), stuckLevel(정체 등급), isPinned(고정),
 * 점수 요소분해(importanceScore/urgencyScore/delayPenalty),
 * 용량/에너지 계획용 신호(estimatedMinutes/requiredEnergy).
 */
public class ScoredTaskResponse {
    private final Long taskId;
    private final String title;
    private final String category;
    private final int estimatedMinutes;
    private final EnergyLevel requiredEnergy;
    private double score;
    private boolean isExploration;
    private boolean isZombie;

    private String urgencyLevel;
    private String reason;
    private boolean isPinned;

    /** 정체 등급(비수치심): NONE/AGING/STUCK/STALLED. */
    private String stuckLevel;

    // 점수 요소분해(설명가능성). 미산출 시 null.
    private Double importanceScore;
    private Double urgencyScore;
    private Double delayPenalty;

    public ScoredTaskResponse(Task task, double score) {
        this.taskId = task.getId();
        this.title = task.getTitle();
        this.category = task.getCategory();
        this.estimatedMinutes = task.getEstimatedMinutes();
        this.requiredEnergy = task.getRequiredEnergy();
        this.score = score;
        this.isExploration = false;
        this.isZombie = task.getDelayCount() >= 5;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getTitle() {
        return title;
    }

    public String getCategory() {
        return category;
    }

    public int getEstimatedMinutes() {
        return estimatedMinutes;
    }

    public EnergyLevel getRequiredEnergy() {
        return requiredEnergy;
    }

    public double getScore() {
        return score;
    }

    public void setScore(double score) {
        this.score = score;
    }

    public boolean isExploration() {
        return isExploration;
    }

    public void setExploration(boolean exploration) {
        isExploration = exploration;
    }

    public boolean isZombie() {
        return isZombie;
    }

    public void setZombie(boolean zombie) {
        isZombie = zombie;
    }

    public String getUrgencyLevel() {
        return urgencyLevel;
    }

    public void setUrgencyLevel(String urgencyLevel) {
        this.urgencyLevel = urgencyLevel;
    }

    /** 마감 임박(RED) 여부. 정렬 시 비-RED 위로 올리는 긴급 하드가드 기준. */
    public boolean isRed() {
        return UrgencyEvaluator.RED.equals(urgencyLevel);
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public boolean isPinned() {
        return isPinned;
    }

    public void setPinned(boolean pinned) {
        isPinned = pinned;
    }

    public String getStuckLevel() {
        return stuckLevel;
    }

    public void setStuckLevel(String stuckLevel) {
        this.stuckLevel = stuckLevel;
    }

    public Double getImportanceScore() {
        return importanceScore;
    }

    public Double getUrgencyScore() {
        return urgencyScore;
    }

    public Double getDelayPenalty() {
        return delayPenalty;
    }

    public void setBreakdown(double importanceScore, double urgencyScore, double delayPenalty) {
        this.importanceScore = importanceScore;
        this.urgencyScore = urgencyScore;
        this.delayPenalty = delayPenalty;
    }
}
