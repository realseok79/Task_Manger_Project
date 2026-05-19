package com.teamsigma.taskmanager.listener;

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
