package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
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
        if (tasks == null || tasks.isEmpty()) {
            return List.of();
        }

        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));

        // 1. 점수 계산 + 신호(urgency/reason/stuck) 매핑 + 점수 요소분해(설명가능성)
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
        responses.sort((t1, t2) -> Double.compare(t2.getScore(), t1.getScore()));

        // 3. 엔트로피 탐색 모드
        List<TaskResponse> ranked = explorationService.applyExplorationMode(userId, responses);

        // 4. 사용자 고정(pin) 적용 — 점수·탐색과 무관하게 최상단(override)
        return applyPins(ranked, pinnedTaskIds);
    }

    /** 고정된 작업을 상대 순서 유지한 채 최상단으로. */
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
