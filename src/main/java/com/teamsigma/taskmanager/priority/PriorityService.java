package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@SuppressWarnings("null") // JPA findById(Long) 레거시 타입과 Eclipse null 분석기 불일치 — 런타임에는 안전
public class PriorityService {

    /**
     * 우선순위 정렬 기준(긴급 하드가드).
     * <ol>
     *   <li>마감 임박(RED) 작업을 비-RED 위로 — 점수가 낮아도 절대 묻히지 않는다(신뢰·UI 일치).</li>
     *   <li>같은 밴드 안에서는 점수 내림차순 — 학습된 중요도 우위를 그대로 유지.</li>
     *   <li>점수 동점이면 더 임박 → 더 중요 → 더 빨리 끝남(퀵윈) → taskId 순으로 결정론적 정렬(동점 무작위 방지).</li>
     * </ol>
     * 점수 공식이 아니라 정렬 계층에 두므로, 야간 가중치 학습이 W1을 올려도 RED 보장은 무너지지 않는다.
     */
    static final Comparator<ScoredTaskResponse> BY_PRIORITY =
            Comparator.comparing(ScoredTaskResponse::isRed).reversed()
                    .thenComparing(Comparator.comparingDouble(ScoredTaskResponse::getScore).reversed())
                    .thenComparing(Comparator.comparingDouble(PriorityService::urgencyTie).reversed())
                    .thenComparing(Comparator.comparingDouble(PriorityService::importanceTie).reversed())
                    .thenComparing(Comparator.comparingInt(ScoredTaskResponse::getEstimatedMinutes)) // 퀵윈: 짧은 것 먼저
                    .thenComparing(ScoredTaskResponse::getTaskId, Comparator.nullsLast(Comparator.naturalOrder()));

    private static double urgencyTie(ScoredTaskResponse r) {
        return r.getUrgencyScore() == null ? 0.0 : r.getUrgencyScore();
    }

    private static double importanceTie(ScoredTaskResponse r) {
        return r.getImportanceScore() == null ? 0.0 : r.getImportanceScore();
    }

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

    public List<ScoredTaskResponse> getPrioritizedTasks(Long userId, List<Task> tasks) {
        return getPrioritizedTasks(userId, tasks, Set.of());
    }

    @Transactional(readOnly = true)
    public List<ScoredTaskResponse> getPrioritizedTasks(Long userId, List<Task> tasks, Set<Long> pinnedTaskIds) {
        if (tasks == null || tasks.isEmpty()) {
            return List.of();
        }

        UserProfile profile = userProfileRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found for ID: " + userId));

        // 1. 점수 계산 + 신호(urgency/reason/stuck) 매핑 + 점수 요소분해(설명가능성)
        List<ScoredTaskResponse> responses = tasks.stream()
                .map(task -> {
                    double score = priorityStrategy.calculate(task, profile);
                    ScoredTaskResponse response = taskResponseMapper.toResponse(task, score);
                    ScoreBreakdown breakdown = priorityStrategy.explain(task, profile);
                    if (breakdown != null) {
                        response.setBreakdown(breakdown.importance(), breakdown.urgency(), breakdown.delayPenalty());
                    }
                    return response;
                })
                .collect(Collectors.toList());

        // 2. 우선순위 정렬 — RED 하드가드 + 점수 내림차순 + 결정론 동점처리
        responses.sort(BY_PRIORITY);

        // 3. 엔트로피 탐색 모드
        List<ScoredTaskResponse> ranked = explorationService.applyExplorationMode(userId, responses);

        // 4. 사용자 고정(pin) 적용 — 점수·탐색과 무관하게 최상단(override)
        return applyPins(ranked, pinnedTaskIds);
    }

    /** 고정된 작업을 상대 순서 유지한 채 최상단으로. */
    private List<ScoredTaskResponse> applyPins(List<ScoredTaskResponse> responses, Set<Long> pinnedTaskIds) {
        if (pinnedTaskIds == null || pinnedTaskIds.isEmpty()) {
            return responses;
        }
        List<ScoredTaskResponse> pinned = new ArrayList<>();
        List<ScoredTaskResponse> rest = new ArrayList<>();
        for (ScoredTaskResponse response : responses) {
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
