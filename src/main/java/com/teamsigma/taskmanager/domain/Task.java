package com.teamsigma.taskmanager.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Set;

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

    @Column(name = "category", nullable = false, length = 100)
    private String category;

    @Builder
    private Task(User user, String title, String description, int estimatedMinutes,
                 LocalDateTime deadline, EnergyLevel requiredEnergy, int importance, String category) {
        this.user = user;
        this.title = title;
        this.description = description;
        this.estimatedMinutes = estimatedMinutes;
        this.deadline = deadline;
        this.requiredEnergy = requiredEnergy;
        this.importance = importance;
        this.status = TaskStatus.PENDING;
        this.delayCount = 0;
        this.category = category != null ? category : "DEFAULT";
    }

    // 상태 전이 Guard: 미완료(PENDING/SNOOZED) 상태에서만 종결/보류 액션을 허용한다.
    private static final Set<TaskStatus> ACTIVE_STATUSES = EnumSet.of(TaskStatus.PENDING, TaskStatus.SNOOZED);

    /** PENDING·SNOOZED → COMPLETED. 그 외 상태에서 호출 시 IllegalStateException. */
    public void complete() {
        if (!ACTIVE_STATUSES.contains(this.status)) {
            throw new IllegalStateException(
                    "PENDING 또는 SNOOZED 상태에서만 완료할 수 있습니다. 현재 상태: " + this.status);
        }
        this.status = TaskStatus.COMPLETED;
    }

    /**
     * PENDING·SNOOZED → SNOOZED(재보류 허용, delayCount 증가). COMPLETED/ARCHIVED 에서 호출 시 IllegalStateException.
     * 재보류를 허용해야 누적 보류 횟수(delayCount)로 좀비(delayCount >= 5)를 식별할 수 있다.
     */
    public void snooze() {
        if (!ACTIVE_STATUSES.contains(this.status)) {
            throw new IllegalStateException(
                    "PENDING 또는 SNOOZED 상태에서만 미룰 수 있습니다. 현재 상태: " + this.status);
        }
        this.status = TaskStatus.SNOOZED;
        this.delayCount++;
    }

    /** PENDING·SNOOZED → ARCHIVED. COMPLETED 상태에서 호출 시 IllegalStateException. */
    public void archive() {
        if (!ACTIVE_STATUSES.contains(this.status)) {
            throw new IllegalStateException(
                    "PENDING 또는 SNOOZED 상태에서만 보관할 수 있습니다. 현재 상태: " + this.status);
        }
        this.status = TaskStatus.ARCHIVED;
    }

    public boolean isZombie() {
        return this.delayCount >= 5;
    }

    /** 현재 시각 기준 마감 임박도. UI 배지/카운트다운 노출 판단용. */
    public DeadlineStatus getDeadlineStatus() {
        return deadlineStatus(LocalDateTime.now());
    }

    /**
     * 기준 시각(reference) 대비 마감 임박도 계산(결정론·테스트 가능하도록 시각을 주입).
     * - CRITICAL : 60분 이내 또는 마감 초과
     * - WARNING  : 24시간 이내
     * - NORMAL   : 24시간 초과
     * - NO_DEADLINE : 마감 없음
     */
    DeadlineStatus deadlineStatus(LocalDateTime reference) {
        if (this.deadline == null) {
            return DeadlineStatus.NO_DEADLINE;
        }
        long minutesUntil = Duration.between(reference, this.deadline).toMinutes();
        if (minutesUntil <= 60) {
            return DeadlineStatus.CRITICAL;
        }
        if (minutesUntil <= 24 * 60) {
            return DeadlineStatus.WARNING;
        }
        return DeadlineStatus.NORMAL;
    }
}
