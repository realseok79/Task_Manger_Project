package com.example.priority;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WeightChangeLogRepository extends JpaRepository<WeightChangeLog, Long> {
    List<WeightChangeLog> findByUserIdOrderByChangedAtDesc(Long userId);
}
