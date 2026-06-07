package com.teamsigma.taskmanager.event;

import com.teamsigma.taskmanager.domain.ActionType;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class TaskActionEvent extends ApplicationEvent {
    private final Task task;
    private final ActionType actionType;
    private final EnergyLevel currentEnergy;
    private final int currentAvailableMinutes;

    public TaskActionEvent(Object source, Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        super(source);
        this.task = task;
        this.actionType = actionType;
        this.currentEnergy = currentEnergy;
        this.currentAvailableMinutes = currentAvailableMinutes;
    }
}
