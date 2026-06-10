package com.teamsigma.taskmanager.controller;

import com.teamsigma.taskmanager.config.ClockConfig;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.service.TaskService;
import com.teamsigma.taskmanager.service.WeightService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
@Import(ClockConfig.class)   // GlobalExceptionHandler 가 Clock 빈을 요구하므로 제공
@DisplayName("UserController 단위 테스트(@WebMvcTest)")
class UserControllerTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private TaskService taskService;
    @MockBean private WeightService weightService;

    @Test
    @DisplayName("POST /api/users/1/weights/reset → 200 OK, 기본값 JSON 반환 + 서비스 호출 verify")
    void should_reset_weights_to_default() throws Exception {
        when(weightService.resetWeights(1L)).thenReturn(new UserProfile(1L, 0.5, 0.3, 0.2));

        mockMvc.perform(post("/api/users/1/weights/reset"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(1))
                .andExpect(jsonPath("$.w1").value(0.5))
                .andExpect(jsonPath("$.w2").value(0.3))
                .andExpect(jsonPath("$.w3").value(0.2));

        verify(weightService).resetWeights(eq(1L));
    }

    @Test
    @DisplayName("GET /api/users/1/weights → 200 OK, 현재 가중치 JSON 반환")
    void should_return_current_weights() throws Exception {
        when(weightService.getWeights(1L)).thenReturn(new UserProfile(1L, 0.6, 0.25, 0.15));

        mockMvc.perform(get("/api/users/1/weights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.w1").value(0.6))
                .andExpect(jsonPath("$.w2").value(0.25))
                .andExpect(jsonPath("$.w3").value(0.15));
    }

    @Test
    @DisplayName("POST reset - 프로필 없음(IllegalArgumentException) → 400 Bad Request")
    void should_return_400_when_profile_missing() throws Exception {
        when(weightService.resetWeights(99L))
                .thenThrow(new IllegalArgumentException("User profile not found for ID: 99"));

        mockMvc.perform(post("/api/users/99/weights/reset"))
                .andExpect(status().isBadRequest());
    }
}
