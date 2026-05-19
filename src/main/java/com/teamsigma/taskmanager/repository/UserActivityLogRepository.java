package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserActivityLogRepository extends JpaRepository<UserActivityLog, Long> {
}
