package com.example.priority;

import java.time.LocalDateTime;

public class Task {
    private final Long id;
    private final String category;
    private final LocalDateTime dueDate;
    private final int starRating;
    private final int delayCount;

    public Task(Long id, String category, LocalDateTime dueDate, int starRating, int delayCount) {
        this.id = id;
        this.category = category;
        this.dueDate = dueDate;
        this.starRating = starRating;
        this.delayCount = delayCount;
    }

    public Long getId() {
        return id;
    }

    public String getCategory() {
        return category;
    }

    public LocalDateTime getDueDate() {
        return dueDate;
    }

    public int getStarRating() {
        return starRating;
    }

    public int getDelayCount() {
        return delayCount;
    }
}
