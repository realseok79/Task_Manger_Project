package com.example.priority;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_activity_logs")
public class UserActivityLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String activityType; // "COMPLETED", "SNOOZED"
    private int starRating;
    private int estimatedTime; // 예상 소요 시간 (분)
    private LocalDateTime timestamp;

    public UserActivityLog() {
    }

    public UserActivityLog(Long userId, String activityType, int starRating, int estimatedTime, LocalDateTime timestamp) {
        this.userId = userId;
        this.activityType = activityType;
        this.starRating = starRating;
        this.estimatedTime = estimatedTime;
        this.timestamp = timestamp;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getActivityType() {
        return activityType;
    }

    public int getStarRating() {
        return starRating;
    }

    public int getEstimatedTime() {
        return estimatedTime;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }
}
