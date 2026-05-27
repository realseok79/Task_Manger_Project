package com.example.priority;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface UserActivityLogRepository extends JpaRepository<UserActivityLog, Long> {
    List<UserActivityLog> findByTimestampAfter(LocalDateTime timestamp);
    List<UserActivityLog> findByUserIdAndTimestampAfterAndActivityType(Long userId, LocalDateTime timestamp, String activityType);
}
