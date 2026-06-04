package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class PriorityService {

    private final PriorityStrategy priorityStrategy;
    private final UserProfileRepository userProfileRepository;
    private final ExplorationService explorationService;

    public PriorityService(PriorityStrategy priorityStrategy,
                           UserProfileRepository userProfileRepository,
                           ExplorationService explorationService) {
        this.priorityStrategy = priorityStrategy;
        this.userProfileRepository = userProfileRepository;
        this.explorationService = explorationService;
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> getPrioritizedTasks(Long userId, List<Task> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return List.of();
        }

        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));

        // 1. 각 작업의 우선순위 점수를 계산하여 TaskResponse DTO 리스트로 변환
        List<TaskResponse> responses = tasks.stream()
                .map(task -> {
                    double score = priorityStrategy.calculate(task, profile);
                    return new TaskResponse(task, score);
                })
                .collect(Collectors.toList());

        // 2. 기본 점수 내림차순 정렬
        responses.sort((t1, t2) -> Double.compare(t2.getScore(), t1.getScore()));

        // 3. 엔트로피 탐색 모드 적용
        return explorationService.applyExplorationMode(userId, responses);
    }
}
