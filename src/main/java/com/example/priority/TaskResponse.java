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

    public TaskResponse(Long taskId, String title, String category, double priorityScore, boolean isExploration, String urgencyLevel, boolean isZombie) {
        this.taskId = taskId;
        this.title = title;
        this.category = category;
        this.priorityScore = priorityScore;
        this.isExploration = isExploration;
        this.urgencyLevel = urgencyLevel;
        this.isZombie = isZombie;
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

    @JsonProperty("isZombie")
    public boolean isZombie() {
        return isZombie;
    }

    @JsonProperty("isZombie")
    public void setZombie(boolean zombie) {
        isZombie = zombie;
    }
}

