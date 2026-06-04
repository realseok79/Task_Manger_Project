package com.teamsigma.taskmanager.config;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.repository.TaskRepository;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

/**
 * 알고리즘 검증용 더미 데이터 시더.
 *
 * 이중 안전장치:
 *  - @Profile("dev"): 운영(prod) 프로파일에서는 빈 자체가 등록되지 않는다.
 *  - @ConditionalOnProperty(app.seed.enabled=true): yml 플래그로 한 번 더 차단한다.
 * → 운영 DB에 더미가 섞여 들어가는 사고를 구조적으로 막는다.
 *
 * 데이터 설계 의도: 엔진(이진석)이 "유저별 행동 편향"을 학습할 수 있도록 두 개의 상반된 페르소나를 심는다.
 */
@Slf4j
@Component
@Profile("dev")
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
@RequiredArgsConstructor
public class DataSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final TaskRepository taskRepository;
    private final UserActivityLogRepository activityLogRepository;

    @Override
    @Transactional // 시더 전체를 한 트랜잭션으로 묶어, 중간 실패 시 부분 적재(오염)를 남기지 않는다.
    public void run(ApplicationArguments args) {
        if (taskRepository.count() > 0) {
            // 이미 데이터가 있으면 재실행하지 않는다(중복 시딩 방지).
            log.info("[DataSeeder] 기존 데이터 감지 → 시딩 건너뜀");
            return;
        }

        User pickyUser = userRepository.save(User.builder()
                .email("picky@sigma.com").nickname("편식러").build());      // userId = 1
        User balancedUser = userRepository.save(User.builder()
                .email("balanced@sigma.com").nickname("균형러").build());   // userId = 2

        seedPickyUser(pickyUser);
        seedBalancedUser(balancedUser);

        log.info("[DataSeeder] 시딩 완료 — Task {}건, ActivityLog {}건",
                taskRepository.count(), activityLogRepository.count());
    }

    /**
     * 시나리오 A — 편식 유저.
     * 쉽고 짧은 일은 잘 끝내지만(완료율 90%), 무겁고 긴 일은 반복적으로 미룬다(SNOOZED). 좀비 2건 포함.
     * 이 편향이 로그에 그대로 남아 "에너지 낮을 때 무거운 일을 회피한다"는 패턴이 학습된다.
     */
    private void seedPickyUser(User user) {
        // (1) 쉽고 짧은 Task 11건: 10건 완료(90%), 1건만 미룸 → 높은 완료율 재현
        for (int i = 1; i <= 11; i++) {
            Task easy = saveTask(user, "가벼운 일 #" + i, 15 + (i % 3) * 5,  // 15~25분
                    EnergyLevel.LOW, 1 + (i % 2));                          // 중요도 1~2
            if (i <= 10) {
                easy.complete();
                taskRepository.save(easy);
                // 쉬운 일은 에너지가 낮아도(LOW) 짧으니 끝낸다 → 완료 맥락 기록
                logAction(easy, ActionType.COMPLETED, EnergyLevel.LOW, 30);
            } else {
                easy.snooze();
                taskRepository.save(easy);
                logAction(easy, ActionType.SNOOZED, EnergyLevel.LOW, 20);
            }
        }

        // (2) 무겁고 긴 Task — 좀비 2건: delayCount 6, 7 까지 반복 미룸
        seedZombie(user, "기말 보고서 작성", 120, EnergyLevel.HIGH, 5, 6, LocalDateTime.now().plusDays(2));
        seedZombie(user, "데이터 마이그레이션 설계", 90, EnergyLevel.HIGH, 4, 7, LocalDateTime.now().plusDays(5));

        // (3) 무겁지만 좀비까지는 아닌 Task 4건: 1~3회 미룬 상태 → 회피 성향의 점진적 증거
        seedSnoozedHeavy(user, "분기 KPI 정리", 60, EnergyLevel.HIGH, 4, 2);
        seedSnoozedHeavy(user, "리팩토링 PR 리뷰", 75, EnergyLevel.HIGH, 5, 3);
        seedSnoozedHeavy(user, "발표 자료 제작", 80, EnergyLevel.MEDIUM, 4, 1);
        seedSnoozedHeavy(user, "장애 회고 문서화", 70, EnergyLevel.HIGH, 4, 2);
    }

    /**
     * 시나리오 B — 균형 유저.
     * 다양한 중요도/소요시간을 고르게 완료하고 SNOOZED는 거의 없다(10건 중 2건만 1회 미룸).
     */
    private void seedBalancedUser(User user) {
        // 중요도/소요시간을 의도적으로 분산시켜 "편식 없음"을 표현
        int[] minutes     = {20, 45, 90, 30, 60, 15, 75, 50, 25, 100};
        int[] importance  = { 2,  3,  5,  1,  4,  2,  5,  3,  1,   4};
        EnergyLevel[] energy = {
                EnergyLevel.LOW, EnergyLevel.MEDIUM, EnergyLevel.HIGH, EnergyLevel.LOW, EnergyLevel.HIGH,
                EnergyLevel.LOW, EnergyLevel.HIGH, EnergyLevel.MEDIUM, EnergyLevel.LOW, EnergyLevel.HIGH
        };
        for (int i = 0; i < minutes.length; i++) {
            Task task = saveTask(user, "균형 작업 #" + (i + 1), minutes[i], energy[i], importance[i]);
            if (i < 8) {
                // 무겁든 가볍든 가리지 않고 완료 → 컨텍스트 에너지를 태스크 요구치에 맞춰 기록
                task.complete();
                taskRepository.save(task);
                logAction(task, ActionType.COMPLETED, energy[i], minutes[i] + 10);
            } else {
                // 단 2건만 1회 미룸(SNOOZED 거의 없음)
                task.snooze();
                taskRepository.save(task);
                logAction(task, ActionType.SNOOZED, energy[i], minutes[i]);
            }
        }
    }

    /** 좀비 태스크: snoozeCount(>=5)회 반복 미루며 미룰 때마다 로그를 남긴다(delayCount 추이가 로그에 보이도록). */
    private void seedZombie(User user, String title, int minutes, EnergyLevel energy, int importance,
                            int snoozeCount, LocalDateTime deadline) {
        Task task = saveTaskWithDeadline(user, title, minutes, energy, importance, deadline);
        for (int i = 0; i < snoozeCount; i++) {
            task.snooze();
            taskRepository.save(task);
            // 편식러는 에너지가 낮을 때 무거운 일을 미룬다 → LOW + 짧은 가용시간 맥락으로 기록
            logAction(task, ActionType.SNOOZED, EnergyLevel.LOW, 30);
        }
    }

    /** 좀비 직전 단계의 무거운 태스크: 소수 회(<5) 미룬 상태로 둔다. */
    private void seedSnoozedHeavy(User user, String title, int minutes, EnergyLevel energy, int importance,
                                  int snoozeCount) {
        Task task = saveTask(user, title, minutes, energy, importance);
        for (int i = 0; i < snoozeCount; i++) {
            task.snooze();
            taskRepository.save(task);
            logAction(task, ActionType.SNOOZED, EnergyLevel.MEDIUM, 45);
        }
    }

    private Task saveTask(User user, String title, int minutes, EnergyLevel energy, int importance) {
        return taskRepository.save(Task.builder()
                .user(user).title(title).estimatedMinutes(minutes)
                .requiredEnergy(energy).importance(importance).build());
    }

    private Task saveTaskWithDeadline(User user, String title, int minutes, EnergyLevel energy,
                                      int importance, LocalDateTime deadline) {
        return taskRepository.save(Task.builder()
                .user(user).title(title).estimatedMinutes(minutes)
                .requiredEnergy(energy).importance(importance).deadline(deadline).build());
    }

    /** 행동 로그 1건 적재. snapshot 팩토리로 "그 시점의 태스크 상태 + 유저 컨텍스트"를 함께 박제한다. */
    private void logAction(Task task, ActionType action, EnergyLevel contextEnergy, int availableMinutes) {
        activityLogRepository.save(
                UserActivityLog.snapshot(task, action, contextEnergy, availableMinutes));
    }
}
