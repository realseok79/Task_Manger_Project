package com.teamsigma.taskmanager.controller;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.repository.TaskRepository;
import com.teamsigma.taskmanager.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Task 4 — 좀비 태스크 API 동작 확인 (전체 스택: Controller → Service → Repository → DB).
 * 응답 계약(zombieTasks[] + explorationModeFlag) 이 확정안대로 직렬화되는지 검증한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional   // 읽기 검증용 셋업 데이터는 테스트 후 자동 롤백 (AFTER_COMMIT 미관여 엔드포인트라 무방)
@DisplayName("좀비 태스크 API 통합 테스트")
@SuppressWarnings("null") // JPA save() 레거시 타입과 Eclipse null 분석기 불일치 — 런타임에는 안전
class ZombieApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private TaskRepository taskRepository;

    private Long userId;

    @BeforeEach
    void setUp() {
        User user = userRepository.save(User.builder().email("zombie@sigma.com").nickname("좀비").build());
        userId = user.getId();

        // 좀비 1건: 6회 미뤄 delayCount=6, status=SNOOZED
        Task zombie = Task.builder().user(user).title("기말 보고서 작성")
                .estimatedMinutes(120).requiredEnergy(EnergyLevel.HIGH).importance(5).build();
        for (int i = 0; i < 6; i++) zombie.snooze();
        taskRepository.save(zombie);

        // 일반 1건: 좀비 조건 미충족(미룬 적 없음)
        taskRepository.save(Task.builder().user(user).title("가벼운 일")
                .estimatedMinutes(20).requiredEnergy(EnergyLevel.LOW).importance(2).build());
    }

    @Test
    @DisplayName("GET /api/tasks/zombie — 좀비만 반환하고 explorationModeFlag는 false")
    void getZombieTasks() throws Exception {
        mockMvc.perform(get("/api/tasks/zombie").param("userId", String.valueOf(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.zombieTasks.length()").value(1))
                .andExpect(jsonPath("$.zombieTasks[0].title").value("기말 보고서 작성"))
                .andExpect(jsonPath("$.zombieTasks[0].delayCount").value(6))
                .andExpect(jsonPath("$.zombieTasks[0].requiredEnergy").value("HIGH"))
                .andExpect(jsonPath("$.explorationModeFlag").value(false));
    }
}
