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
    private String category;
    private int starRating;
    private int estimatedTime; // 예상 소요 시간 (분)
    private LocalDateTime timestamp;

    public UserActivityLog() {
    }

    public UserActivityLog(Long userId, String activityType, String category, int starRating, int estimatedTime, LocalDateTime timestamp) {
        this.userId = userId;
        this.activityType = activityType;
        this.category = category;
        this.starRating = starRating;
        this.estimatedTime = estimatedTime;
        this.timestamp = timestamp;
    }

    // 기존 테스트 코드 호환을 위한 5개 파라미터 생성자 오버로딩
    public UserActivityLog(Long userId, String activityType, int starRating, int estimatedTime, LocalDateTime timestamp) {
        this(userId, activityType, "DEFAULT", starRating, estimatedTime, timestamp);
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

    public String getCategory() {
        return category;
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
