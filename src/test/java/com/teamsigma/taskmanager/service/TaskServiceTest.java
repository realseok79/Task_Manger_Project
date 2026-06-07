package com.teamsigma.taskmanager.service;

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

    @Nested
    @DisplayName("snoozeTask")
    class SnoozeTaskTest {
        @Test
        @DisplayName("PENDING 태스크 → SNOOZED 로 변경되고 delayCount 가 증가한다")
        void should_change_to_SNOOZED_and_increment_delayCount_when_pending() {
            // given
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task)); // task 는 PENDING
            // when
            taskService.snoozeTask(1L, EnergyLevel.LOW, 30);
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.SNOOZED);
            assertThat(task.getDelayCount()).isEqualTo(1);
            verify(eventPublisher, times(1)).publishEvent(any(TaskActionEvent.class));
        }

        @Test
        @DisplayName("COMPLETED 태스크 → snooze 호출 시 IllegalStateException")
        void should_throw_IllegalStateException_when_snoozing_completed_task() {
            // given
            task.complete(); // PENDING → COMPLETED
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            // when / then
            assertThatThrownBy(() -> taskService.snoozeTask(1L, EnergyLevel.LOW, 30))
                    .isInstanceOf(IllegalStateException.class);
            verify(eventPublisher, never()).publishEvent(any());
        }
    }

    @Nested
    @DisplayName("archiveTask")
    class ArchiveTaskTest {
        @Test
        @DisplayName("PENDING 태스크 → ARCHIVED 로 변경된다")
        void should_change_to_ARCHIVED_when_pending() {
            // given
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            // when
            taskService.archiveTask(1L, EnergyLevel.LOW, 30);
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.ARCHIVED);
            verify(eventPublisher, times(1)).publishEvent(any(TaskActionEvent.class));
        }

        @Test
        @DisplayName("COMPLETED 태스크 → archive 호출 시 IllegalStateException")
        void should_throw_IllegalStateException_when_archiving_completed_task() {
            // given
            task.complete();
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            // when / then
            assertThatThrownBy(() -> taskService.archiveTask(1L, EnergyLevel.LOW, 30))
                    .isInstanceOf(IllegalStateException.class);
            verify(eventPublisher, never()).publishEvent(any());
        }
    }

    @Nested
    @DisplayName("completeTask - 상태 가드")
    class CompleteGuardTest {
        @Test
        @DisplayName("이미 COMPLETED 인 태스크 → complete 재호출 시 IllegalStateException")
        void should_throw_IllegalStateException_when_completing_already_completed_task() {
            // given
            task.complete();
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            // when / then
            assertThatThrownBy(() -> taskService.completeTask(1L, EnergyLevel.HIGH, 90))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("ARCHIVED 인 태스크 → complete 호출 시 IllegalStateException")
        void should_throw_IllegalStateException_when_completing_archived_task() {
            // given
            task.archive();
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            // when / then
            assertThatThrownBy(() -> taskService.completeTask(1L, EnergyLevel.HIGH, 90))
                    .isInstanceOf(IllegalStateException.class);
        }
    }
}
