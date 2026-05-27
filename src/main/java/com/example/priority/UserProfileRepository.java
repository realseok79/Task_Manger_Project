package com.example.priority;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {

    @Modifying(clearAutomatically = true)
    @Query("UPDATE UserProfile u SET u.newUser = false WHERE u.newUser = true AND u.createdAt < :threshold")
    int bulkTransitionNewUsers(@Param("threshold") LocalDateTime threshold);
}

