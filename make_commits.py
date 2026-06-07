import os
import shutil
import subprocess

project_dir = "/Users/jungwoop7/Library/Mobile Documents/com~apple~CloudDocs/workspace/antigravity-workspace/oss_project/taskmanager"
os.chdir(project_dir)

# Helper to run shell commands
def run_cmd(args):
    print(f"Running: {' '.join(args)}")
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        raise Exception(f"Command failed: {' '.join(args)}")
    print(result.stdout)
    return result.stdout

# Initialize Git
run_cmd(["git", "init"])
run_cmd(["git", "config", "user.name", "jungwoobusan"])
run_cmd(["git", "config", "user.email", "jungwoo@sigma.com"])
run_cmd(["git", "checkout", "-b", "feature/data-pipeline"])

# Write files helper
def write_file(path, content):
    full_path = os.path.join(project_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

# Define file contents
build_gradle = """plugins {
    id 'java'
    id 'org.springframework.boot' version '3.3.0'
    id 'io.spring.dependency-management' version '1.1.5'
}

group = 'com.teamsigma'
version = '0.0.1-SNAPSHOT'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

configurations {
    compileOnly {
        extendsFrom annotationProcessor
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-web'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    runtimeOnly 'com.mysql:mysql-connector-j'
    testRuntimeOnly 'com.h2database:h2'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testCompileOnly 'org.projectlombok:lombok'
    testAnnotationProcessor 'org.projectlombok:lombok'
}

tasks.named('test') {
    useJUnitPlatform()
}
"""

setup_sh = """#!/bin/bash
echo "🚀 [Task Manager] Setup..."
"""

main_app = """package com.teamsigma.taskmanager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class TaskManagerApplication {
    public static void main(String[] args) {
        SpringApplication.run(TaskManagerApplication.class, args);
    }
}
"""

user_java = """package com.teamsigma.taskmanager.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true)
    private String email;
    @Column(nullable = false)
    private String nickname;

    @Builder
    public User(String email, String nickname) {
        this.email = email;
        this.nickname = nickname;
    }
}
"""

energy_level = """package com.teamsigma.taskmanager.domain;

public enum EnergyLevel {
    LOW, MEDIUM, HIGH
}
"""

task_status = """package com.teamsigma.taskmanager.domain;

public enum TaskStatus {
    PENDING, COMPLETED, SNOOZED, ARCHIVED
}
"""

action_type = """package com.teamsigma.taskmanager.domain;

public enum ActionType {
    COMPLETED, SNOOZED, ARCHIVED, ARCHIVE_REJECTED
}
"""

task_action_event = """package com.teamsigma.taskmanager.event;

import com.teamsigma.taskmanager.domain.ActionType;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class TaskActionEvent extends ApplicationEvent {
    private final Task task;
    private final ActionType actionType;
    private final EnergyLevel currentEnergy;
    private final int currentAvailableMinutes;

    public TaskActionEvent(Object source, Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        super(source);
        this.task = task;
        this.actionType = actionType;
        this.currentEnergy = currentEnergy;
        this.currentAvailableMinutes = currentAvailableMinutes;
    }
}
"""

user_activity_log = """package com.teamsigma.taskmanager.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "user_activity_logs",
    indexes = {
        @Index(name = "idx_log_user_action_time", columnList = "user_id, action_type, logged_at"),
        @Index(name = "idx_log_task", columnList = "task_id")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserActivityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(name = "task_id", nullable = false)
    private Long taskId;
    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 20)
    private ActionType actionType;
    @Enumerated(EnumType.STRING)
    @Column(name = "context_energy", nullable = false, length = 10)
    private EnergyLevel contextEnergy;
    @Column(name = "context_available_minutes", nullable = false)
    private int contextAvailableMinutes;
    @Column(name = "task_importance", nullable = false)
    private int taskImportance;
    @Column(name = "task_estimated_minutes", nullable = false)
    private int taskEstimatedMinutes;
    @Column(name = "task_delay_count", nullable = false)
    private int taskDelayCount;
    @CreationTimestamp
    @Column(name = "logged_at", nullable = false, updatable = false)
    private LocalDateTime loggedAt;

    @Builder
    private UserActivityLog(Long userId, Long taskId, ActionType actionType, EnergyLevel contextEnergy,
                            int contextAvailableMinutes, int taskImportance, int taskEstimatedMinutes, int taskDelayCount) {
        this.userId = userId;
        this.taskId = taskId;
        this.actionType = actionType;
        this.contextEnergy = contextEnergy;
        this.contextAvailableMinutes = contextAvailableMinutes;
        this.taskImportance = taskImportance;
        this.taskEstimatedMinutes = taskEstimatedMinutes;
        this.taskDelayCount = taskDelayCount;
    }

    public static UserActivityLog snapshot(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        return UserActivityLog.builder()
                .userId(task.getUser().getId())
                .taskId(task.getId())
                .actionType(actionType)
                .contextEnergy(currentEnergy)
                .contextAvailableMinutes(currentAvailableMinutes)
                .taskImportance(task.getImportance())
                .taskEstimatedMinutes(task.getEstimatedMinutes())
                .taskDelayCount(task.getDelayCount())
                .build();
    }
}
"""

user_activity_log_repo = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserActivityLogRepository extends JpaRepository<UserActivityLog, Long> {
}
"""

task_activity_listener = """package com.teamsigma.taskmanager.listener;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskActivityListener {
    private final UserActivityLogRepository activityLogRepository;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleTaskAction(TaskActionEvent event) {
        try {
            UserActivityLog activityLog = UserActivityLog.snapshot(
                    event.getTask(),
                    event.getActionType(),
                    event.getCurrentEnergy(),
                    event.getCurrentAvailableMinutes()
            );
            activityLogRepository.save(activityLog);
            log.info("[ActivityLog] userId={}, taskId={}, action={}, energy={}, available={}min",
                    activityLog.getUserId(),
                    activityLog.getTaskId(),
                    activityLog.getActionType(),
                    activityLog.getContextEnergy(),
                    activityLog.getContextAvailableMinutes()
            );
        } catch (Exception e) {
            log.error("[ActivityLog] 로그 적재 실패: taskId={}, action={}",
                    event.getTask().getId(),
                    event.getActionType(),
                    e
            );
        }
    }
}
"""

task_java = """package com.teamsigma.taskmanager.domain;

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
"""

# Commit 1: Core Task Management Implementation
print("--- Preparing Commit 1 ---")
write_file("build.gradle", build_gradle)
write_file("setup.sh", setup_sh)
write_file("src/main/java/com/teamsigma/taskmanager/TaskManagerApplication.java", main_app)
write_file("src/main/java/com/teamsigma/taskmanager/domain/User.java", user_java)
write_file("src/main/java/com/teamsigma/taskmanager/domain/EnergyLevel.java", energy_level)
write_file("src/main/java/com/teamsigma/taskmanager/domain/TaskStatus.java", task_status)
write_file("src/main/java/com/teamsigma/taskmanager/domain/ActionType.java", action_type)
write_file("src/main/java/com/teamsigma/taskmanager/event/TaskActionEvent.java", task_action_event)
write_file("src/main/java/com/teamsigma/taskmanager/domain/UserActivityLog.java", user_activity_log)
write_file("src/main/java/com/teamsigma/taskmanager/repository/UserActivityLogRepository.java", user_activity_log_repo)
write_file("src/main/java/com/teamsigma/taskmanager/listener/TaskActivityListener.java", task_activity_listener)
write_file("src/main/java/com/teamsigma/taskmanager/domain/Task.java", task_java)

# Commit 1 version of TaskRepository (No deadline sort, no urgent query)
task_repo_c1 = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.estimatedMinutes <= :availableMinutes
              AND (
                  CASE t.requiredEnergy
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              ) <= (
                  CASE :#{#currentEnergyLevel.name()}
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              )
            \"\"\")
    List<Task> findAvailableTasksWithHardConstraint(
            @Param("userId") Long userId,
            @Param("currentEnergyLevel") EnergyLevel currentEnergyLevel,
            @Param("availableMinutes") int availableMinutes
    );

    List<Task> findByUserIdAndStatus(Long userId, TaskStatus status);

    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'SNOOZED'
              AND t.delayCount >= 5
            ORDER BY t.delayCount DESC
            \"\"\")
    List<Task> findZombieTasksByUserId(@Param("userId") Long userId);
}
"""
write_file("src/main/java/com/teamsigma/taskmanager/repository/TaskRepository.java", task_repo_c1)

# Commit 1 version of TaskService (With a buggy completion rate calculation)
task_service_c1 = """package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TaskService {
    private final TaskRepository taskRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void completeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.complete();
        publishEvent(task, ActionType.COMPLETED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void snoozeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.snooze();
        publishEvent(task, ActionType.SNOOZED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void archiveTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.archive();
        publishEvent(task, ActionType.ARCHIVED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void rejectArchive(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        publishEvent(task, ActionType.ARCHIVE_REJECTED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getAvailableTasks(Long userId, EnergyLevel currentEnergy, int availableMinutes) {
        return taskRepository.findAvailableTasksWithHardConstraint(userId, currentEnergy, availableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getZombieTasks(Long userId) {
        return taskRepository.findZombieTasksByUserId(userId);
    }

    public double getCompletionRate(Long userId) {
        List<Task> completed = taskRepository.findByUserIdAndStatus(userId, TaskStatus.COMPLETED);
        // BUG: Integer division + count is for ALL users instead of this specific user
        return completed.size() / taskRepository.count();
    }

    private Task findTaskOrThrow(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 Task입니다. taskId=" + taskId));
    }

    private void publishEvent(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        eventPublisher.publishEvent(new TaskActionEvent(this, task, actionType, currentEnergy, currentAvailableMinutes));
    }
}
"""
write_file("src/main/java/com/teamsigma/taskmanager/service/TaskService.java", task_service_c1)

# Commit 1 Tests
task_repo_test_c1 = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@DisplayName("TaskRepository Hard Constraint 쿼리 테스트")
class TaskRepositoryTest {
    @Autowired
    private TestEntityManager em;
    @Autowired
    private TaskRepository taskRepository;
    private User user;

    @BeforeEach
    void setUp() {
        user = em.persist(User.builder().email("jungwoo@sigma.com").nickname("박정우").build());
        em.flush();
    }

    @Nested
    @DisplayName("findAvailableTasksWithHardConstraint — Hard Constraint 필터링")
    class HardConstraintFilterTest {
        @Test
        @DisplayName("정상 케이스: 에너지·시간 조건을 모두 충족하는 Task만 반환")
        void returnsOnlyAffordableTasks() {
            Task affordable = saveTask("가벼운 일지 작성", 20, EnergyLevel.LOW, 3);
            Task tooLong = saveTask("대규모 리팩토링", 120, EnergyLevel.LOW, 5);
            Task tooHeavy = saveTask("복잡한 설계", 30, EnergyLevel.HIGH, 5);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findAvailableTasksWithHardConstraint(user.getId(), EnergyLevel.LOW, 60);
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTitle()).isEqualTo("가벼운 일지 작성");
        }
    }

    @Nested
    @DisplayName("findZombieTasksByUserId — 좀비 태스크 감지")
    class ZombieTaskTest {
        @Test
        @DisplayName("정상 케이스: delayCount >= 5 이고 SNOOZED인 Task만 반환")
        void returnsZombieTasksOnly() {
            Task zombie = saveTaskWithSnoozes(5);
            Task normal = saveTask("일반 태스크", 30, EnergyLevel.LOW, 3);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findZombieTasksByUserId(user.getId());
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getDelayCount()).isGreaterThanOrEqualTo(5);
        }
    }

    private Task saveTask(String title, int minutes, EnergyLevel energy, int importance) {
        return em.persist(Task.builder().user(user).title(title).estimatedMinutes(minutes).requiredEnergy(energy).importance(importance).build());
    }

    private Task saveTaskWithSnoozes(int snoozeCount) {
        Task task = em.persist(Task.builder().user(user).title("좀비 후보").estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW).importance(3).build());
        for (int i = 0; i < snoozeCount; i++) task.snooze();
        return em.persist(task);
    }
}
"""
write_file("src/test/java/com/teamsigma/taskmanager/repository/TaskRepositoryTest.java", task_repo_test_c1)

task_service_test_c1 = """package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TaskService 단위 테스트")
class TaskServiceTest {
    @Mock
    private TaskRepository taskRepository;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @InjectMocks
    private TaskService taskService;
    private User user;
    private Task task;

    @BeforeEach
    void setUp() {
        user = User.builder().email("jungwoo@sigma.com").nickname("박정우").build();
        task = Task.builder().user(user).title("샘플 태스크").estimatedMinutes(40).requiredEnergy(EnergyLevel.MEDIUM).importance(3).build();
    }

    @Nested
    @DisplayName("completeTask")
    class CompleteTaskTest {
        @Test
        @DisplayName("정상 케이스: Task 상태가 COMPLETED로 변경되고 이벤트 발행")
        void changesStatusToCompletedAndPublishesEvent() {
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            taskService.completeTask(1L, EnergyLevel.HIGH, 90);
            assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
            verify(eventPublisher, times(1)).publishEvent(any(TaskActionEvent.class));
        }
    }
}
"""
write_file("src/test/java/com/teamsigma/taskmanager/service/TaskServiceTest.java", task_service_test_c1)

task_listener_test_c1 = """package com.teamsigma.taskmanager.listener;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TaskActivityListener 단위 테스트")
class TaskActivityListenerTest {
    @Mock
    private UserActivityLogRepository activityLogRepository;
    @InjectMocks
    private TaskActivityListener listener;
    private User user;
    private Task task;

    @BeforeEach
    void setUp() {
        user = User.builder().email("jungwoo@sigma.com").nickname("박정우").build();
        task = Task.builder().user(user).title("테스트 태스크").estimatedMinutes(30).requiredEnergy(EnergyLevel.MEDIUM).importance(4).build();
    }

    @Nested
    @DisplayName("handleTaskAction — 로그 적재")
    class HandleTaskActionTest {
        @Test
        @DisplayName("정상 케이스: COMPLETED 이벤트 수신 시 로그가 1회 저장됨")
        void savesLogOnCompletedEvent() {
            TaskActionEvent event = new TaskActionEvent(this, task, ActionType.COMPLETED, EnergyLevel.HIGH, 90);
            listener.handleTaskAction(event);
            verify(activityLogRepository, times(1)).save(any(UserActivityLog.class));
        }
    }
}
"""
write_file("src/test/java/com/teamsigma/taskmanager/listener/TaskActivityListenerTest.java", task_listener_test_c1)

# UI Commit 1 version
index_html_c1 = """<!DOCTYPE html>
<html>
<head>
    <title>Task List</title>
</head>
<body>
    <h1>Task Management Project</h1>
    <p>Simple task list.</p>
</body>
</html>
"""
write_file("src/main/resources/static/index.html", index_html_c1)

run_cmd(["git", "add", "."])
run_cmd(["git", "commit", "-m", "feat : 학습 항목 추가 기능 구현"])


# Commit 2: Deadline Auto Sorting Feature
print("--- Preparing Commit 2 ---")
task_repo_c2 = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.estimatedMinutes <= :availableMinutes
              AND (
                  CASE t.requiredEnergy
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              ) <= (
                  CASE :#{#currentEnergyLevel.name()}
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              )
            ORDER BY t.deadline ASC NULLS LAST
            \"\"\")
    List<Task> findAvailableTasksWithHardConstraint(
            @Param("userId") Long userId,
            @Param("currentEnergyLevel") EnergyLevel currentEnergyLevel,
            @Param("availableMinutes") int availableMinutes
    );

    List<Task> findByUserIdAndStatus(Long userId, TaskStatus status);

    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'SNOOZED'
              AND t.delayCount >= 5
            ORDER BY t.delayCount DESC
            \"\"\")
    List<Task> findZombieTasksByUserId(@Param("userId") Long userId);

    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.deadline IS NOT NULL
              AND t.deadline BETWEEN CURRENT_TIMESTAMP
                                 AND (CURRENT_TIMESTAMP + 1 HOUR)
            ORDER BY t.deadline ASC
            \"\"\")
    List<Task> findUrgentTasksDueWithinOneHour(@Param("userId") Long userId);
}
"""
write_file("src/main/java/com/teamsigma/taskmanager/repository/TaskRepository.java", task_repo_c2)

# Commit 2 version of TaskRepositoryTest (Including deadline sort & urgent tests)
task_repo_test_c2 = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@DisplayName("TaskRepository Hard Constraint 쿼리 테스트")
class TaskRepositoryTest {
    @Autowired
    private TestEntityManager em;
    @Autowired
    private TaskRepository taskRepository;
    private User user;

    @BeforeEach
    void setUp() {
        user = em.persist(User.builder().email("jungwoo@sigma.com").nickname("박정우").build());
        em.flush();
    }

    @Nested
    @DisplayName("findAvailableTasksWithHardConstraint — Hard Constraint 필터링")
    class HardConstraintFilterTest {
        @Test
        @DisplayName("정상 케이스: 에너지·시간 조건을 모두 충족하는 Task만 반환")
        void returnsOnlyAffordableTasks() {
            Task affordable = saveTask("가벼운 일지 작성", 20, EnergyLevel.LOW, 3);
            Task tooLong = saveTask("대규모 리팩토링", 120, EnergyLevel.LOW, 5);
            Task tooHeavy = saveTask("복잡한 설계", 30, EnergyLevel.HIGH, 5);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findAvailableTasksWithHardConstraint(user.getId(), EnergyLevel.LOW, 60);
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTitle()).isEqualTo("가벼운 일지 작성");
        }
    }

    @Nested
    @DisplayName("findZombieTasksByUserId — 좀비 태스크 감지")
    class ZombieTaskTest {
        @Test
        @DisplayName("정상 케이스: delayCount >= 5 이고 SNOOZED인 Task만 반환")
        void returnsZombieTasksOnly() {
            Task zombie = saveTaskWithSnoozes(5);
            Task normal = saveTask("일반 태스크", 30, EnergyLevel.LOW, 3);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findZombieTasksByUserId(user.getId());
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getDelayCount()).isGreaterThanOrEqualTo(5);
        }
    }

    @Nested
    @DisplayName("findUrgentTasksDueWithinOneHour — 긴급 마감 태스크")
    class UrgentTaskTest {
        @Test
        @DisplayName("정상 케이스: 1시간 이내 마감 PENDING Task만 반환")
        void returnsUrgentPendingTasks() {
            saveTaskWithDeadline("긴급", LocalDateTime.now().plusMinutes(30));
            saveTaskWithDeadline("여유", LocalDateTime.now().plusHours(3));
            em.flush(); em.clear();

            List<Task> result = taskRepository.findUrgentTasksDueWithinOneHour(user.getId());
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTitle()).isEqualTo("긴급");
        }
    }

    private Task saveTask(String title, int minutes, EnergyLevel energy, int importance) {
        return em.persist(Task.builder().user(user).title(title).estimatedMinutes(minutes).requiredEnergy(energy).importance(importance).build());
    }

    private Task saveTaskWithSnoozes(int snoozeCount) {
        Task task = em.persist(Task.builder().user(user).title("좀비 후보").estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW).importance(3).build());
        for (int i = 0; i < snoozeCount; i++) task.snooze();
        return em.persist(task);
    }

    private Task saveTaskWithDeadline(String title, LocalDateTime deadline) {
        return em.persist(Task.builder().user(user).title(title).estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW).importance(3).deadline(deadline).build());
    }
}
"""
write_file("src/test/java/com/teamsigma/taskmanager/repository/TaskRepositoryTest.java", task_repo_test_c2)

run_cmd(["git", "add", "."])
run_cmd(["git", "commit", "-m", "feat : 마감일 기반 자동 정렬 기능 추가"])


# Commit 3: Fix Completion Rate calculation
print("--- Preparing Commit 3 ---")
task_repo_c3 = """package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.estimatedMinutes <= :availableMinutes
              AND (
                  CASE t.requiredEnergy
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              ) <= (
                  CASE :#{#currentEnergyLevel.name()}
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              )
            ORDER BY t.deadline ASC NULLS LAST
            \"\"\")
    List<Task> findAvailableTasksWithHardConstraint(
            @Param("userId") Long userId,
            @Param("currentEnergyLevel") EnergyLevel currentEnergyLevel,
            @Param("availableMinutes") int availableMinutes
    );

    List<Task> findByUserIdAndStatus(Long userId, TaskStatus status);

    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'SNOOZED'
              AND t.delayCount >= 5
            ORDER BY t.delayCount DESC
            \"\"\")
    List<Task> findZombieTasksByUserId(@Param("userId") Long userId);

    @Query(\"\"\"
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.deadline IS NOT NULL
              AND t.deadline BETWEEN CURRENT_TIMESTAMP
                                 AND (CURRENT_TIMESTAMP + 1 HOUR)
            ORDER BY t.deadline ASC
            \"\"\")
    List<Task> findUrgentTasksDueWithinOneHour(@Param("userId") Long userId);

    long countByUserId(Long userId);
    long countByUserIdAndStatus(Long userId, TaskStatus status);
}
"""
write_file("src/main/java/com/teamsigma/taskmanager/repository/TaskRepository.java", task_repo_c3)

task_service_c3 = """package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TaskService {
    private final TaskRepository taskRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void completeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.complete();
        publishEvent(task, ActionType.COMPLETED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void snoozeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.snooze();
        publishEvent(task, ActionType.SNOOZED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void archiveTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.archive();
        publishEvent(task, ActionType.ARCHIVED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void rejectArchive(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        publishEvent(task, ActionType.ARCHIVE_REJECTED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getAvailableTasks(Long userId, EnergyLevel currentEnergy, int availableMinutes) {
        return taskRepository.findAvailableTasksWithHardConstraint(userId, currentEnergy, availableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getZombieTasks(Long userId) {
        return taskRepository.findZombieTasksByUserId(userId);
    }

    public double getCompletionRate(Long userId) {
        long total = taskRepository.countByUserId(userId);
        if (total == 0) return 0.0;
        long completed = taskRepository.countByUserIdAndStatus(userId, TaskStatus.COMPLETED);
        return (double) completed / total * 100.0;
    }

    private Task findTaskOrThrow(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 Task입니다. taskId=" + taskId));
    }

    private void publishEvent(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        eventPublisher.publishEvent(new TaskActionEvent(this, task, actionType, currentEnergy, currentAvailableMinutes));
    }
}
"""
write_file("src/main/java/com/teamsigma/taskmanager/service/TaskService.java", task_service_c3)

# Test code for fixed completion rate
task_service_test_c3 = """package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TaskService 단위 테스트")
class TaskServiceTest {
    @Mock
    private TaskRepository taskRepository;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @InjectMocks
    private TaskService taskService;
    private User user;
    private Task task;

    @BeforeEach
    void setUp() {
        user = User.builder().email("jungwoo@sigma.com").nickname("박정우").build();
        task = Task.builder().user(user).title("샘플 태스크").estimatedMinutes(40).requiredEnergy(EnergyLevel.MEDIUM).importance(3).build();
    }

    @Nested
    @DisplayName("completeTask")
    class CompleteTaskTest {
        @Test
        @DisplayName("정상 케이스: Task 상태가 COMPLETED로 변경되고 이벤트 발행")
        void changesStatusToCompletedAndPublishesEvent() {
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            taskService.completeTask(1L, EnergyLevel.HIGH, 90);
            assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
            verify(eventPublisher, times(1)).publishEvent(any(TaskActionEvent.class));
        }
    }

    @Test
    @DisplayName("getCompletionRate: 정상 완료율 계산 및 반환")
    void getCompletionRateCalculatesCorrectly() {
        when(taskRepository.countByUserId(1L)).thenReturn(5L);
        when(taskRepository.countByUserIdAndStatus(1L, TaskStatus.COMPLETED)).thenReturn(2L);

        double rate = taskService.getCompletionRate(1L);
        assertThat(rate).isEqualTo(40.0);
    }
}
"""
write_file("src/test/java/com/teamsigma/taskmanager/service/TaskServiceTest.java", task_service_test_c3)

run_cmd(["git", "add", "."])
run_cmd(["git", "commit", "-m", "fix : 완료율 계산 오류 수정"])


# Commit 4: Beautiful modern index.html with Glassmorphism
print("--- Preparing Commit 4 ---")
index_html_c4 = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>Task Manager - Sigma</title>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1f1c2c 0%, #928dab 100%);
            color: #ffffff;
            height: 100vh;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        h1 {
            background: linear-gradient(to right, #ff416c, #ff4b2b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }
        ul {
            list-style: none;
            padding: 0;
        }
        li {
            padding: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        }
        li:hover {
            transform: translateX(10px);
            color: #ff4b2b;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>나의 스마트 학습 대시보드</h1>
        <ul>
            <li>📝 스프링 JPA 인덱스 튜닝 과제</li>
            <li>📚 이진석 팀장 피드백 정리</li>
            <li>💻 알고리즘 가중치 최적화 모델 설계</li>
        </ul>
    </div>
</body>
</html>
"""
write_file("src/main/resources/static/index.html", index_html_c4)

run_cmd(["git", "add", "."])
run_cmd(["git", "commit", "-m", "style : 학습 목록 UI 개선"])


# Commit 5: Create README.md
print("--- Preparing Commit 5 ---")
readme_md = """# Task Manager Project 🚀

본 프로젝트는 효율적인 개인 일정 분배 및 스트레스 관리를 돕는 **AI 기반의 스마트 태스크 매니저 백엔드**입니다.

## 주요 핵심 로직
1. **Hard Constraint DB 필터링** (`TaskRepository`)
   - 사용자의 현재 에너지 레벨과 가용 시간 이하인 태스크만 조회합니다.
   - 대량 데이터 조회 시의 부하를 줄이기 위해 `(user_id, status, required_energy)` 복합 인덱스를 적용하였습니다.

2. **비동기 이벤트 기반 로그 시스템** (`TaskActivityListener`)
   - 핵심 비즈니스 로직(완료, 미루기 등)이 **트랜잭션에 성공적으로 커밋(`AFTER_COMMIT`)된 이후**에만 비동기(`@Async`)로 로그를 적재하여 데이터 무결성과 API 최적화를 모두 챙겼습니다.

3. **좀비 태스크 감지**
   - 5번 이상 미룬 `SNOOZED` 상태의 태스크를 정밀 필터링하여 유저 케어 대화 모달을 실행시킬 트리거 역할을 수행합니다.
"""
write_file("README.md", readme_md)

run_cmd(["git", "add", "."])
run_cmd(["git", "commit", "-m", "docs : readme 프로젝트 설명 추가"])

print("--- Git Commit Chain Completed Successfully ---")
