package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 2 — 복합 인덱스 성능 검증.
 *
 * 목적: 더미 1,000건을 적재한 뒤 하드 컨스트레인트 조회가 100ms 이내인지 보장(회귀 방지)하고,
 *       인덱스 유/무에 따른 H2 실행계획(EXPLAIN ANALYZE)을 캡처해 비교 근거를 남긴다.
 */
@DataJpaTest
@DisplayName("TaskRepository 복합 인덱스 성능 테스트")
class TaskRepositoryPerformanceTest {

    private static final int DATA_SIZE = 1_000;       // 요구사항: 더미 1,000건
    private static final int USER_COUNT = 20;         // 여러 유저에 분산 → user_id 선택도(selectivity)를 살린다
    private static final long SLA_MILLIS = 100L;      // 요구사항: 100ms 이내

    @Autowired
    private TestEntityManager em;
    @Autowired
    private TaskRepository taskRepository;

    @Test
    @DisplayName("1,000건 적재 후 하드 컨스트레인트 조회가 100ms 이내여야 한다")
    void filteredQueryUnderSla() {
        // 현실적 분포: 20명 유저 × 50건, 상태를 섞는다(약 30%만 PENDING).
        // 단일 유저·단일 상태로 채우면 인덱스 선택도가 0이라 (user_id, status) 복합 인덱스의 효과가 가려진다.
        List<User> users = new java.util.ArrayList<>();
        for (int u = 0; u < USER_COUNT; u++) {
            users.add(em.persist(User.builder().email("perf" + u + "@sigma.com").nickname("성능" + u).build()));
        }
        EnergyLevel[] energies = EnergyLevel.values();
        for (int i = 0; i < DATA_SIZE; i++) {
            Task task = em.persist(Task.builder()
                    .user(users.get(i % USER_COUNT))            // 유저 라운드로빈 분산
                    .title("부하 태스크 #" + i)
                    .estimatedMinutes(10 + (i % 50))            // 10~59분 (모두 60분 이하라 시간 필터 통과)
                    .requiredEnergy(energies[i % energies.length])
                    .importance(1 + (i % 5))
                    .build());
            // 상태 분포: 0~2 PENDING(유지), 3~5 COMPLETED, 6~7 SNOOZED, 8~9 ARCHIVED → PENDING ≈ 30%
            int bucket = i % 10;
            if (bucket >= 3 && bucket <= 5) task.complete();
            else if (bucket >= 6 && bucket <= 7) task.snooze();
            else if (bucket >= 8) task.archive();
            if (i % 100 == 0) em.flush();                       // 영속성 컨텍스트 비대화 방지(주기적 flush)
        }
        em.flush();
        em.clear();                                             // 1차 캐시 비워 실제 DB 조회를 강제

        Long targetUserId = users.get(0).getId();               // user_id = 1 조회 대상

        // 워밍업: 첫 호출의 쿼리 플랜 캐싱/클래스 로딩 비용을 측정에서 제외
        taskRepository.findAvailableTasksWithHardConstraint(targetUserId, EnergyLevel.MEDIUM, 60);

        // 본 측정: 여러 번 실행해 평균을 낸다(단발 측정의 노이즈 완화)
        int runs = 10;
        long totalNanos = 0;
        List<Task> result = null;
        for (int i = 0; i < runs; i++) {
            long start = System.nanoTime();
            result = taskRepository.findAvailableTasksWithHardConstraint(targetUserId, EnergyLevel.MEDIUM, 60);
            totalNanos += (System.nanoTime() - start);
        }
        double avgMillis = (totalNanos / (double) runs) / 1_000_000.0;

        System.out.printf("[PERF] 평균 조회 시간 = %.2f ms (결과 %d건, 전체 %d건 / 유저 %d명)%n",
                avgMillis, result.size(), DATA_SIZE, USER_COUNT);

        assertThat(result).isNotEmpty();                        // 조건을 만족하는 태스크가 실제로 반환되어야 함
        assertThat(avgMillis).isLessThan(SLA_MILLIS);           // 핵심 SLA: 100ms 이내

        // --- 인덱스 유/무 실행계획 캡처 (문서화 근거) ---
        captureExplainPlans();
    }

    /**
     * H2 EXPLAIN ANALYZE 를 세 가지 상태로 캡처해 문서화 근거를 남긴다.
     * 1) 복합 인덱스 존재  2) 복합 인덱스 제거(FK 인덱스로 폴백)  3) 풀스캔 참고(인덱스 못 타는 술어).
     * 풀스캔 참고를 두는 이유: H2는 FK 컬럼(user_id)에 인덱스를 자동 생성하므로, 동일 쿼리에서
     * "진짜 인덱스 0개" 상태를 만들 수 없다. 그래서 인덱스를 못 타는 술어로 풀스캔 비용(전체 행 스캔)을 따로 보여준다.
     */
    private void captureExplainPlans() {
        EntityManager entityManager = em.getEntityManager();
        String targetQuery = """
                EXPLAIN ANALYZE
                SELECT * FROM tasks
                WHERE user_id = 1 AND status = 'PENDING' AND estimated_minutes <= 60
                ORDER BY deadline
                """;
        // importance 는 인덱스가 없어 전 구간(모든 행)을 훑는 풀스캔이 된다 → 스캔 비용의 상한 레퍼런스.
        String fullScanRef = "EXPLAIN ANALYZE SELECT * FROM tasks WHERE importance >= 1";

        System.out.println("===EXPLAIN_COMPOSITE_PRESENT_START===");
        System.out.println(runExplain(entityManager, targetQuery));
        System.out.println("===EXPLAIN_COMPOSITE_PRESENT_END===");

        entityManager.createNativeQuery("DROP INDEX IF EXISTS idx_task_user_status_energy").executeUpdate();
        System.out.println("===EXPLAIN_COMPOSITE_DROPPED_START===");
        System.out.println(runExplain(entityManager, targetQuery));
        System.out.println("===EXPLAIN_COMPOSITE_DROPPED_END===");

        System.out.println("===EXPLAIN_FULLSCAN_REF_START===");
        System.out.println(runExplain(entityManager, fullScanRef));
        System.out.println("===EXPLAIN_FULLSCAN_REF_END===");

        // 스키마 원복: 다른 테스트/관례를 위해 인덱스를 다시 만든다.
        entityManager.createNativeQuery(
                "CREATE INDEX idx_task_user_status_energy ON tasks (user_id, status, required_energy)")
                .executeUpdate();
    }

    private String runExplain(EntityManager entityManager, String sql) {
        // H2의 EXPLAIN ANALYZE 는 계획 텍스트를 행 단위로 반환한다 → 줄바꿈으로 합쳐 가독성 확보.
        List<?> rows = entityManager.createNativeQuery(sql).getResultList();
        StringBuilder sb = new StringBuilder();
        for (Object row : rows) {
            sb.append(row instanceof Object[] arr ? String.valueOf(arr[0]) : String.valueOf(row)).append('\n');
        }
        return sb.toString().trim();
    }
}
