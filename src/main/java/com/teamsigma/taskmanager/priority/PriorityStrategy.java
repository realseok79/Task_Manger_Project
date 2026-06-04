package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;

public interface PriorityStrategy {
    double calculate(Task task, UserProfile profile);
}
