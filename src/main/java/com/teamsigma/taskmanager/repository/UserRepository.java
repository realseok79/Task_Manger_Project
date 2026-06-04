package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * User 조회용 리포지토리.
 * Task 생성 시 소유자(User)를 영속 상태로 로딩하기 위해 필요하다(분리된 객체로 연관관계를 맺으면 무결성이 깨지므로).
 */
public interface UserRepository extends JpaRepository<User, Long> {
}
