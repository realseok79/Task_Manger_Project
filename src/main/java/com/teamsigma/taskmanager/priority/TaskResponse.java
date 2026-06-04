package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;

/**
 * 프론트엔드 연동을 위한 TaskResponse DTO
 * 
 * [응답 JSON 예시]
 * {
 *     "taskId": 101,
 *     "category": "DOCUMENTATION",
 *     "score": 150.0,
 *     "isExploration": true
 * }
 */
public class TaskResponse {
    private final Long taskId;
    private final String category;
    private double score;
    private boolean isExploration;

    public TaskResponse(Task task, double score) {
        this.taskId = task.getId();
        this.category = task.getCategory();
        this.score = score;
        this.isExploration = false;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getCategory() {
        return category;
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
}
