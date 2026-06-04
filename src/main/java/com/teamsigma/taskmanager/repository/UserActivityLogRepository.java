package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.domain.ActionType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;

public interface UserActivityLogRepository extends JpaRepository<UserActivityLog, Long> {

    List<UserActivityLog> findByLoggedAtAfter(LocalDateTime loggedAt);
    List<UserActivityLog> findByUserIdAndLoggedAtAfterAndActionType(Long userId, LocalDateTime loggedAt, ActionType actionType);

    // 엔진 파트(이진석) 연동용: 특정 유저의 행동 로그를 최신순으로 조회.
    // logged_at 정렬은 idx_log_user_action_time 복합 인덱스의 마지막 컬럼으로 커버된다.
    List<UserActivityLog> findByUserIdOrderByLoggedAtDesc(Long userId);

    // 비동기 적재 무결성 테스트에서 "특정 유저 로그 건수"를 검증하는 데 사용.
    long countByUserId(Long userId);
}
