package com.teamsigma.taskmanager.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Task 도메인 단위 테스트 (Spring context 미로드).
 *
 * 상태 전이 매트릭스 (행=현재 상태, 열=액션):
 *
 *  | 현재 \ 액션 | complete()        | snooze()                   | archive()         |
 *  |-------------|-------------------|----------------------------|-------------------|
 *  | PENDING     | ✓ → COMPLETED     | ✓ → SNOOZED (delayCount++) | ✓ → ARCHIVED      |
 *  | SNOOZED     | ✓ → COMPLETED     | ✓ → SNOOZED (delayCount++) | ✓ → ARCHIVED      |
 *  | COMPLETED   | ✗ IllegalState    | ✗ IllegalState             | ✗ IllegalState    |
 *  | ARCHIVED    | ✗ IllegalState    | ✗ IllegalState             | ✗ IllegalState    |
 */
@DisplayName("Task 도메인 - 상태 전이 매트릭스")
class TaskDomainTest {

    private static Task newPending() {
        return Task.builder()
                .title("샘플")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .importance(3)
                .build();
    }

    private static Task taskInStatus(TaskStatus status) {
        Task task = newPending();
        switch (status) {
            case PENDING -> { /* already pending */ }
            case SNOOZED -> task.snooze();
            case COMPLETED -> task.complete();
            case ARCHIVED -> task.archive();
        }
        return task;
    }

    @Nested
    @DisplayName("complete()")
    class CompleteTest {
        @Test
        void should_transition_to_COMPLETED_when_completing_pending_task() {
            // given
            Task task = taskInStatus(TaskStatus.PENDING);
            // when
            task.complete();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
        }

        @Test
        void should_transition_to_COMPLETED_when_completing_snoozed_task() {
            // given
            Task task = taskInStatus(TaskStatus.SNOOZED);
            // when
            task.complete();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
        }

        @Test
        void should_throw_IllegalStateException_when_completing_already_completed_task() {
            // given
            Task task = taskInStatus(TaskStatus.COMPLETED);
            // when / then
            assertThatThrownBy(task::complete)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: COMPLETED");
        }

        @Test
        void should_throw_IllegalStateException_when_completing_archived_task() {
            // given
            Task task = taskInStatus(TaskStatus.ARCHIVED);
            // when / then
            assertThatThrownBy(task::complete)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: ARCHIVED");
        }
    }

    @Nested
    @DisplayName("snooze()")
    class SnoozeTest {
        @Test
        void should_transition_to_SNOOZED_and_increment_delayCount_when_snoozing_pending_task() {
            // given
            Task task = taskInStatus(TaskStatus.PENDING);
            // when
            task.snooze();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.SNOOZED);
            assertThat(task.getDelayCount()).isEqualTo(1);
        }

        @Test
        void should_keep_SNOOZED_and_increment_delayCount_when_re_snoozing_snoozed_task() {
            // given
            Task task = taskInStatus(TaskStatus.SNOOZED); // delayCount = 1
            // when
            task.snooze();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.SNOOZED);
            assertThat(task.getDelayCount()).isEqualTo(2);
        }

        @Test
        void should_become_zombie_when_snoozed_five_or_more_times() {
            // given
            Task task = newPending();
            // when
            for (int i = 0; i < 5; i++) {
                task.snooze();
            }
            // then
            assertThat(task.getDelayCount()).isEqualTo(5);
            assertThat(task.isZombie()).isTrue();
        }

        @Test
        void should_throw_IllegalStateException_when_snoozing_completed_task() {
            // given
            Task task = taskInStatus(TaskStatus.COMPLETED);
            // when / then
            assertThatThrownBy(task::snooze)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: COMPLETED");
        }

        @Test
        void should_throw_IllegalStateException_when_snoozing_archived_task() {
            // given
            Task task = taskInStatus(TaskStatus.ARCHIVED);
            // when / then
            assertThatThrownBy(task::snooze)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: ARCHIVED");
        }
    }

    @Nested
    @DisplayName("archive()")
    class ArchiveTest {
        @Test
        void should_transition_to_ARCHIVED_when_archiving_pending_task() {
            // given
            Task task = taskInStatus(TaskStatus.PENDING);
            // when
            task.archive();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.ARCHIVED);
        }

        @Test
        void should_transition_to_ARCHIVED_when_archiving_snoozed_task() {
            // given
            Task task = taskInStatus(TaskStatus.SNOOZED);
            // when
            task.archive();
            // then
            assertThat(task.getStatus()).isEqualTo(TaskStatus.ARCHIVED);
        }

        @Test
        void should_throw_IllegalStateException_when_archiving_completed_task() {
            // given
            Task task = taskInStatus(TaskStatus.COMPLETED);
            // when / then
            assertThatThrownBy(task::archive)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: COMPLETED");
        }

        @Test
        void should_throw_IllegalStateException_when_archiving_already_archived_task() {
            // given
            Task task = taskInStatus(TaskStatus.ARCHIVED);
            // when / then
            assertThatThrownBy(task::archive)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("현재 상태: ARCHIVED");
        }
    }

    @Nested
    @DisplayName("deadlineStatus()")
    class DeadlineStatusTest {
        private final LocalDateTime now = LocalDateTime.of(2026, 6, 7, 12, 0);

        private Task taskWithDeadline(LocalDateTime deadline) {
            return Task.builder()
                    .title("샘플")
                    .estimatedMinutes(30)
                    .requiredEnergy(EnergyLevel.MEDIUM)
                    .importance(3)
                    .deadline(deadline)
                    .build();
        }

        @Test
        void should_return_NO_DEADLINE_when_deadline_is_null() {
            assertThat(taskWithDeadline(null).deadlineStatus(now)).isEqualTo(DeadlineStatus.NO_DEADLINE);
        }

        @Test
        void should_return_CRITICAL_when_within_60_minutes() {
            assertThat(taskWithDeadline(now.plusMinutes(30)).deadlineStatus(now)).isEqualTo(DeadlineStatus.CRITICAL);
        }

        @Test
        void should_return_CRITICAL_when_overdue() {
            assertThat(taskWithDeadline(now.minusMinutes(10)).deadlineStatus(now)).isEqualTo(DeadlineStatus.CRITICAL);
        }

        @Test
        void should_return_WARNING_when_within_24_hours() {
            assertThat(taskWithDeadline(now.plusHours(5)).deadlineStatus(now)).isEqualTo(DeadlineStatus.WARNING);
        }

        @Test
        void should_return_NORMAL_when_beyond_24_hours() {
            assertThat(taskWithDeadline(now.plusDays(3)).deadlineStatus(now)).isEqualTo(DeadlineStatus.NORMAL);
        }
    }
}
