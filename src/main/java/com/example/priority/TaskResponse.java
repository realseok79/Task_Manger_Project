package com.example.priority;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 프론트엔드 연동을 위한 TaskResponse DTO
 * 
 * [응답 JSON 예시]
 * {
 *     "taskId": 1,
 *     "title": "알고리즘 설계서 작성",
 *     "priorityScore": 87.4,
 *     "category": "DOCUMENTATION",
 *     "isExploration": true,
 *     "urgencyLevel": "RED",
 *     "isZombie": false
 * }
 */
public class TaskResponse {
    private final Long taskId;
    private String title;
    private final String category;
    private double priorityScore;

    @JsonProperty("isExploration")
    private boolean isExploration;

    private String urgencyLevel;

    @JsonProperty("isZombie")
    private boolean isZombie;

    /** 이 작업이 왜 이 순위/긴급도인지 사람이 읽을 수 있는 사유(설명가능성). */
    private String reason;

    @JsonProperty("isPinned")
    private boolean isPinned;

    // 점수 요소분해(설명가능성): 각 요소의 가중 기여분. 미산출 시 null.
    private Double importanceScore;
    private Double urgencyScore;
    private Double delayPenalty;

    /** 정체 등급(비수치심): NONE / AGING / STUCK / STALLED. 이진 isZombie를 보완. */
    private String stuckLevel;

    public TaskResponse(Long taskId, String title, String category, double priorityScore, boolean isExploration, String urgencyLevel, boolean isZombie, String reason) {
        this.taskId = taskId;
        this.title = title;
        this.category = category;
        this.priorityScore = priorityScore;
        this.isExploration = isExploration;
        this.urgencyLevel = urgencyLevel;
        this.isZombie = isZombie;
        this.reason = reason;
    }

    // 하위 호환성 및 테스트용 생성자
    public TaskResponse(Task task, double priorityScore) {
        this.taskId = task.getId();
        this.title = task.getTitle();
        this.category = task.getCategory();
        this.priorityScore = priorityScore;
        this.isExploration = false;
        this.urgencyLevel = "GREEN";
        this.isZombie = task.getDelayCount() >= 5;
        this.reason = null;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCategory() {
        return category;
    }

    public double getPriorityScore() {
        return priorityScore;
    }

    public void setPriorityScore(double priorityScore) {
        this.priorityScore = priorityScore;
    }

    @JsonProperty("isExploration")
    public boolean isExploration() {
        return isExploration;
    }

    @JsonProperty("isExploration")
    public void setExploration(boolean exploration) {
        isExploration = exploration;
    }

    public String getUrgencyLevel() {
        return urgencyLevel;
    }

    public void setUrgencyLevel(String urgencyLevel) {
        this.urgencyLevel = urgencyLevel;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    @JsonProperty("isPinned")
    public boolean isPinned() {
        return isPinned;
    }

    @JsonProperty("isPinned")
    public void setPinned(boolean pinned) {
        isPinned = pinned;
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

    /** 점수 요소분해(중요도/긴급도 기여, 지연 페널티)를 설정한다. */
    public void setBreakdown(double importanceScore, double urgencyScore, double delayPenalty) {
        this.importanceScore = importanceScore;
        this.urgencyScore = urgencyScore;
        this.delayPenalty = delayPenalty;
    }

    public String getStuckLevel() {
        return stuckLevel;
    }

    public void setStuckLevel(String stuckLevel) {
        this.stuckLevel = stuckLevel;
    }

    @JsonProperty("isZombie")
    public boolean isZombie() {
        return isZombie;
    }

    @JsonProperty("isZombie")
    public void setZombie(boolean zombie) {
        isZombie = zombie;
    }
}

