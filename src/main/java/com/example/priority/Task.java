package com.example.priority;

import java.time.LocalDateTime;

public class Task {
    private final LocalDateTime dueDate;
    private final int starRating;
    private final int delayCount;

    public Task(LocalDateTime dueDate, int starRating, int delayCount) {
        this.dueDate = dueDate;
        this.starRating = starRating;
        this.delayCount = delayCount;
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
