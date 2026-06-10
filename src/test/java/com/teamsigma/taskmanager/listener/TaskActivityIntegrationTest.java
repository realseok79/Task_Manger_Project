package com.teamsigma.taskmanager.listener;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.repository.TaskRepository;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserRepository;
import com.teamsigma.taskmanager.service.TaskService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Duration;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

/**
 * Task 3 — 비동기 로그 적재 "무결성" 통합 테스트.
 *
 * 왜 @Transactional 을 안 쓰는가: 테스트에 @Transactional 을 붙이면 트랜잭션이 절대 커밋되지 않아
 * @TransactionalEventListener(AFTER_COMMIT) 가 영원히 발화하지 않는다. 즉 실제 커밋/롤백 동작을
 * 검증하려면 테스트가 진짜로 커밋/롤백을 일으켜야 한다. → 데이터는 @AfterEach 에서 수동 정리한다.
 *
 * @Async 적재는 별도 스레드에서 일어나므로 Awaitility 로 결과가 보일 때까지 폴링한다(슬립/플래키 방지).
 */
@SpringBootTest
@DisplayName("TaskActivityListener 비동기 적재 무결성 통합 테스트")
@SuppressWarnings("null")
class TaskActivityIntegrationTest {

    @Autowired private TaskService taskService;
    @Autowired private TaskRepository taskRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private UserActivityLogRepository activityLogRepository;
    @Autowired private PlatformTransactionManager transactionManager;

    private Long taskId;

    @BeforeEach
    void setUp() {
        // 깨끗한 상태에서 시작 (이전 메서드의 커밋 잔재 제거)
        cleanUp();
        User user = userRepository.save(User.builder().email("commit@sigma.com").nickname("커밋").build());
        Task task = taskRepository.save(Task.builder()
                .user(user).title("상태변경 대상").estimatedMinutes(40)
                .requiredEnergy(EnergyLevel.MEDIUM).importance(3).build());
        taskId = task.getId();
    }

    @AfterEach
    void tearDown() {
        cleanUp();
    }

    @Test
    @DisplayName("[A] 정상 커밋 시 UserActivityLog가 1건 저장되어야 한다")
    void whenCommit_thenLogSaved() {
        // when: 상태 변경 서비스가 정상 커밋 → AFTER_COMMIT 발화 → @Async 적재
        taskService.completeTask(taskId, EnergyLevel.HIGH, 90);

        // then: 비동기 적재가 끝날 때까지 기다린 뒤 로그 1건 확인
        await().atMost(Duration.ofSeconds(3))
                .untilAsserted(() -> assertThat(activityLogRepository.count()).isEqualTo(1));

        UserActivityLog log = activityLogRepository.findAll().get(0);
        assertThat(log.getActionType()).isEqualTo(ActionType.COMPLETED);
        assertThat(log.getContextEnergy()).isEqualTo(EnergyLevel.HIGH);   // 행동 시점 컨텍스트가 스냅샷됨
        assertThat(log.getContextAvailableMinutes()).isEqualTo(90);
        // 상태 변경도 실제 DB에 반영되었는지 확인
        assertThat(taskRepository.findById(taskId).orElseThrow().getStatus()).isEqualTo(TaskStatus.COMPLETED);
    }

    @Test
    @DisplayName("[B] 트랜잭션 롤백 시 UserActivityLog가 저장되지 않아야 한다 (핵심 무결성)")
    void whenRollback_thenLogNotSaved() {
        TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);

        // when: 같은 트랜잭션 안에서 상태 변경 후 강제로 예외 → 전체 롤백
        assertThatThrownBy(() ->
                txTemplate.executeWithoutResult(status -> {
                    taskService.completeTask(taskId, EnergyLevel.LOW, 15); // 이벤트는 발행되지만 아직 미커밋
                    throw new RuntimeException("강제 롤백 유도");             // 롤백 → AFTER_COMMIT 미발화
                })
        ).isInstanceOf(RuntimeException.class);

        // then: 일정 시간 동안 "계속" 0건이어야 한다(뒤늦은 비동기 적재도 없어야 함).
        await().during(Duration.ofMillis(800)).atMost(Duration.ofSeconds(2))
                .until(() -> activityLogRepository.count() == 0);

        // 상태 변경 자체도 롤백되어 PENDING 그대로여야 한다.
        assertThat(taskRepository.findById(taskId).orElseThrow().getStatus()).isEqualTo(TaskStatus.PENDING);
    }

    private void cleanUp() {
        // 로그는 FK가 없는 평탄 테이블, tasks는 users를 참조 → 자식부터 삭제
        activityLogRepository.deleteAll();
        taskRepository.deleteAll();
        userRepository.deleteAll();
    }
}
