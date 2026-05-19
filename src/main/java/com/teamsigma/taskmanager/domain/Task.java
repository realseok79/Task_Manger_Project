package com.teamsigma.taskmanager.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "tasks",
    indexes = {
        @Index(name = "idx_task_user_status_energy", columnList = "user_id, status, required_energy"),
        @Index(name = "idx_task_user_deadline", columnList = "user_id, deadline")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@ToString(exclude = "user")
public class Task {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 255)
    private String title;
    @Column(length = 1000)
    private String description;
    @Column(name = "estimated_minutes", nullable = false)
    private int estimatedMinutes;
    @Column(name = "deadline")
    private LocalDateTime deadline;
    @Enumerated(EnumType.STRING)
    @Column(name = "required_energy", nullable = false, length = 10)
    private EnergyLevel requiredEnergy;
    @Column(nullable = false)
    private int importance;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TaskStatus status = TaskStatus.PENDING;
    @Column(name = "delay_count", nullable = false)
    private int delayCount = 0;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Task(User user, String title, String description, int estimatedMinutes,
                 LocalDateTime deadline, EnergyLevel requiredEnergy, int importance) {
        this.user = user;
        this.title = title;
        this.description = description;
        this.estimatedMinutes = estimatedMinutes;
        this.deadline = deadline;
        this.requiredEnergy = requiredEnergy;
        this.importance = importance;
        this.status = TaskStatus.PENDING;
        this.delayCount = 0;
    }

    public void complete() {
        this.status = TaskStatus.COMPLETED;
    }

    public void snooze() {
        this.status = TaskStatus.SNOOZED;
        this.delayCount++;
    }

    public void archive() {
        this.status = TaskStatus.ARCHIVED;
    }

    public boolean isZombie() {
        return this.delayCount >= 5;
    }
}
