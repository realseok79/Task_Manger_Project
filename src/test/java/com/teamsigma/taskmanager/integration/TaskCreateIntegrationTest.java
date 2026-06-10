package com.teamsigma.taskmanager.integration;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.dto.TaskCreateRequest;
import com.teamsigma.taskmanager.dto.TaskResponse;
import com.teamsigma.taskmanager.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

/**
 * Task 생성 통합 테스트 (Controller → Service → Repository → H2).
 * 전 구간(Bean Validation, category 기본값, 영속화)을 실제 HTTP 로 검증한다.
 */
@SpringBootTest(webEnvironment = RANDOM_PORT)
@DisplayName("Task 생성 통합 테스트")
@SuppressWarnings("null")
class TaskCreateIntegrationTest {

    @Autowired private TestRestTemplate restTemplate;
    @Autowired private UserRepository userRepository;

    private Long userId;

    @BeforeEach
    void setUp() {
        // @SpringBootTest(RANDOM_PORT) 는 테스트 간 롤백하지 않으므로 unique email 로 충돌을 피한다.
        String email = "create-" + UUID.randomUUID() + "@sigma.com";
        User user = userRepository.save(User.builder().email(email).nickname("작성자").build());
        userId = user.getId();
    }

    @Test
    @DisplayName("유효한 요청 → 201 Created + 응답 category 가 요청값과 일치")
    void should_return_201_and_echo_category_when_request_is_valid() {
        // given
        TaskCreateRequest request = new TaskCreateRequest(
                userId, "통합 테스트 과제", "설명", 60, null, EnergyLevel.MEDIUM, 4, "업무");

        // when
        ResponseEntity<TaskResponse> response = restTemplate.postForEntity("/api/tasks", request, TaskResponse.class);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        TaskResponse body = response.getBody();
        assertThat(body.category()).isEqualTo("업무");
        assertThat(response.getHeaders().getLocation()).isNotNull();
    }

    @Test
    @DisplayName("category 미입력 → 201 Created + 응답 category 가 \"DEFAULT\"")
    void should_default_category_to_DEFAULT_when_category_omitted() {
        // given
        TaskCreateRequest request = new TaskCreateRequest(
                userId, "카테고리 없는 과제", null, 60, null, EnergyLevel.MEDIUM, 4, null);

        // when
        ResponseEntity<TaskResponse> response = restTemplate.postForEntity("/api/tasks", request, TaskResponse.class);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().category()).isEqualTo("DEFAULT");
    }

    @Test
    @DisplayName("title 길이 초과 → 400 Bad Request (Bean Validation)")
    void should_return_400_when_title_exceeds_max_length() {
        // given: title 의 실제 제약은 @Size(max=255) 이므로 256자로 위반을 유발한다.
        // (원 스펙은 50자로 적혀 있으나, 기존 API 계약인 255자 제한을 변경하지 않고 그 위반을 검증한다.)
        String tooLong = "가".repeat(256);
        TaskCreateRequest request = new TaskCreateRequest(
                userId, tooLong, null, 60, null, EnergyLevel.MEDIUM, 4, null);

        // when
        ResponseEntity<String> response = restTemplate.postForEntity("/api/tasks", request, String.class);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("importance = 0 → 400 Bad Request (Bean Validation @Min)")
    void should_return_400_when_importance_is_zero() {
        // given
        TaskCreateRequest request = new TaskCreateRequest(
                userId, "중요도 0 과제", null, 60, null, EnergyLevel.MEDIUM, 0, null);

        // when
        ResponseEntity<String> response = restTemplate.postForEntity("/api/tasks", request, String.class);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
