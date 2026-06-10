package com.teamsigma.taskmanager.listener;

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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TaskActivityListener 단위 테스트")
@SuppressWarnings("null")
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
