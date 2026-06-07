package com.teamsigma.taskmanager.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.teamsigma.taskmanager.config.ClockConfig;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.dto.TaskCreateRequest;
import com.teamsigma.taskmanager.exception.TaskNotFoundException;
import com.teamsigma.taskmanager.priority.PriorityService;
import com.teamsigma.taskmanager.priority.ScoredTaskResponse;
import com.teamsigma.taskmanager.service.TaskService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TaskController.class)
@Import(ClockConfig.class)   // GlobalExceptionHandler 가 Clock 빈을 요구하므로 제공
@DisplayName("TaskController 단위 테스트(@WebMvcTest)")
class TaskControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private TaskService taskService;
    @MockBean private PriorityService priorityService;

    private Task taskWithId(Long id, String category) {
        Task task = Task.builder()
                .title("기말 보고서 작성")
                .description("초안")
                .estimatedMinutes(120)
                .requiredEnergy(EnergyLevel.HIGH)
                .importance(5)
                .category(category)
                .build();
        ReflectionTestUtils.setField(task, "id", id);
        return task;
    }

    @Test
    @DisplayName("GET /api/tasks/prioritized?userId=1 → 200 OK, JSON 배열 + PriorityService 호출 verify")
    void should_return_200_and_invoke_priorityService_when_listing_prioritized() throws Exception {
        // given
        Task task = taskWithId(101L, "업무");
        when(taskService.getActiveTasks(1L)).thenReturn(List.of(task));
        when(priorityService.getPrioritizedTasks(eq(1L), any()))
                .thenReturn(List.of(new ScoredTaskResponse(task, 9.9)));

        // when / then
        mockMvc.perform(get("/api/tasks/prioritized").param("userId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].taskId").value(101));

        verify(priorityService).getPrioritizedTasks(eq(1L), any());
    }

    @Test
    @DisplayName("GET /api/tasks/{id} 존재하지 않는 ID → 404 Not Found")
    void should_return_404_when_task_not_found() throws Exception {
        // given
        when(taskService.getTask(999L)).thenThrow(new TaskNotFoundException(999L));

        // when / then
        mockMvc.perform(get("/api/tasks/999"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/tasks → 201 Created + Location 헤더 포함")
    void should_return_201_with_location_when_creating_task() throws Exception {
        // given
        when(taskService.createTask(any())).thenReturn(taskWithId(101L, "업무"));
        TaskCreateRequest request = new TaskCreateRequest(
                1L, "기말 보고서 작성", "초안", 120, null, EnergyLevel.HIGH, 5, "업무");

        // when / then
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/api/tasks/101")))
                .andExpect(jsonPath("$.taskId").value(101))
                .andExpect(jsonPath("$.category").value("업무"));
    }

    @Test
    @DisplayName("POST /api/tasks → importance 범위 초과(0) → 400 Bad Request")
    void should_return_400_when_importance_out_of_range() throws Exception {
        // given: importance = 0 (@Min(1) 위반)
        TaskCreateRequest request = new TaskCreateRequest(
                1L, "제목", null, 30, null, EnergyLevel.HIGH, 0, null);

        // when / then
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/tasks → title 누락 → 400 Bad Request")
    void should_return_400_when_title_is_missing() throws Exception {
        // given: title = null (@NotBlank 위반)
        TaskCreateRequest request = new TaskCreateRequest(
                1L, null, null, 30, null, EnergyLevel.HIGH, 3, null);

        // when / then
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /api/tasks/completed?userId=1 → 200 OK, category 필드 포함")
    void should_return_200_with_category_when_listing_completed() throws Exception {
        // given
        when(taskService.getCompletedTasks(1L)).thenReturn(List.of(taskWithId(101L, "업무")));

        // when / then
        mockMvc.perform(get("/api/tasks/completed").param("userId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].taskId").value(101))
                .andExpect(jsonPath("$[0].category").value("업무"));
    }
}
