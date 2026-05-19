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
}
