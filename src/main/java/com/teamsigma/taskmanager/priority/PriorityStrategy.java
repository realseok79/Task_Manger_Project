package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;

public interface PriorityStrategy {
    double calculate(Task task, UserProfile profile);

    /** 점수의 요소별 기여분(설명가능성). 기본 구현은 미지원(null). */
    default ScoreBreakdown explain(Task task, UserProfile profile) {
        return null;
    }
}
