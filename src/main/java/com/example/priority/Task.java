package com.example.priority;

import java.time.LocalDateTime;

public class Task {
    private final Long id;
    private String title;
    private final String category;
    private final LocalDateTime dueDate;
    private final int starRating;
    private final int delayCount;

    public Task(Long id, String title, String category, LocalDateTime dueDate, int starRating, int delayCount) {
        this.id = id;
        this.title = title;
        this.category = category;
        this.dueDate = dueDate;
        this.starRating = starRating;
        this.delayCount = delayCount;
    }

    public Task(Long id, String category, LocalDateTime dueDate, int starRating, int delayCount) {
        this(id, "Untitled", category, dueDate, starRating, delayCount);
    }

    public Long getId() {
        return id;
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

