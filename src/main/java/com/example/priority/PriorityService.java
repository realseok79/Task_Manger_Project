package com.example.priority;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PriorityService {

    private final PriorityStrategy priorityStrategy;
    private final UserProfileRepository userProfileRepository;
    private final ExplorationService explorationService;
    private final TaskResponseMapper taskResponseMapper;

    public PriorityService(PriorityStrategy priorityStrategy,
                           UserProfileRepository userProfileRepository,
                           ExplorationService explorationService,
                           TaskResponseMapper taskResponseMapper) {
        this.priorityStrategy = priorityStrategy;
        this.userProfileRepository = userProfileRepository;
        this.explorationService = explorationService;
        this.taskResponseMapper = taskResponseMapper;
    }

    public List<TaskResponse> getPrioritizedTasks(Long userId, List<Task> tasks) {
        return getPrioritizedTasks(userId, tasks, Set.of());
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> getPrioritizedTasks(Long userId, List<Task> tasks, Set<Long> pinnedTaskIds) {
        if (userId == null) {
            throw new IllegalArgumentException("User ID must not be null");
        }
        if (tasks == null || tasks.isEmpty()) {
            return List.of();
        }

        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));

        // 1. 각 작업의 점수를 계산해 DTO로 변환하고, 요소분해(설명가능성)도 채운다.
        List<TaskResponse> responses = tasks.stream()
                .map(task -> {
                    double score = priorityStrategy.calculate(task, profile);
                    TaskResponse response = taskResponseMapper.toResponse(task, score);
                    ScoreBreakdown breakdown = priorityStrategy.explain(task, profile);
                    if (breakdown != null) {
                        response.setBreakdown(breakdown.importance(), breakdown.urgency(), breakdown.delayPenalty());
                    }
                    return response;
                })
                .collect(Collectors.toList());

        // 2. 기본 점수 내림차순 정렬
        responses.sort((t1, t2) -> Double.compare(t2.getPriorityScore(), t1.getPriorityScore()));

        // 3. 탐색 모드(신규 유저는 폴백으로 건너뜀)
        List<TaskResponse> ranked = profile.isNewUser()
                ? responses
                : explorationService.applyExplorationMode(userId, responses);

        // 4. 사용자 고정(pin) 적용 — 점수/탐색과 무관하게 최상단 (override)
        return applyPins(ranked, pinnedTaskIds);
    }

    /** 고정된 작업을 상대 순서를 유지한 채 최상단으로 올린다. */
    private List<TaskResponse> applyPins(List<TaskResponse> responses, Set<Long> pinnedTaskIds) {
        if (pinnedTaskIds == null || pinnedTaskIds.isEmpty()) {
            return responses;
        }
        List<TaskResponse> pinned = new ArrayList<>();
        List<TaskResponse> rest = new ArrayList<>();
        for (TaskResponse response : responses) {
            if (pinnedTaskIds.contains(response.getTaskId())) {
                response.setPinned(true);
                String base = response.getReason();
                response.setReason((base == null || base.isBlank()) ? "사용자 고정" : "사용자 고정 · " + base);
                pinned.add(response);
            } else {
                rest.add(response);
            }
        }
        pinned.addAll(rest);
        return pinned;
    }
}

