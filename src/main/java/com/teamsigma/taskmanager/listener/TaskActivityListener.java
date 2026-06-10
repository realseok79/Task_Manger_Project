package com.teamsigma.taskmanager.listener;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
@SuppressWarnings("null") // JPA save()가 레거시 타입을 반환해 Eclipse null 분석기와 불일치 — 런타임에는 안전
public class TaskActivityListener {
    private final UserActivityLogRepository activityLogRepository;

    // 전용 풀(activityLogExecutor)에서 실행: 로그 적재가 메인 응답 스레드를 점유하지 않게 격리한다.
    // 비동기(@Async) + AFTER_COMMIT 시점이라 원 트랜잭션은 이미 종료된 상태이므로,
    // REQUIRES_NEW 로 독립 트랜잭션 경계를 명시해 비동기 컨텍스트에서도 적재가 커밋되도록 보장한다.
    @Async("activityLogExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
