# Task Manager Project 🚀

본 프로젝트는 효율적인 개인 일정 분배 및 스트레스 관리를 돕는 **AI 기반의 스마트 태스크 매니저 백엔드**입니다.

## 주요 핵심 로직
1. **Hard Constraint DB 필터링** (`TaskRepository`)
   - 사용자의 현재 에너지 레벨과 가용 시간 이하인 태스크만 조회합니다.
   - 대량 데이터 조회 시의 부하를 줄이기 위해 `(user_id, status, required_energy)` 복합 인덱스를 적용하였습니다.

2. **비동기 이벤트 기반 로그 시스템** (`TaskActivityListener`)
   - 핵심 비즈니스 로직(완료, 미루기 등)이 **트랜잭션에 성공적으로 커밋(`AFTER_COMMIT`)된 이후**에만 비동기(`@Async`)로 로그를 적재하여 데이터 무결성과 API 최적화를 모두 챙겼습니다.

3. **좀비 태스크 감지**
   - 5번 이상 미룬 `SNOOZED` 상태의 태스크를 정밀 필터링하여 유저 케어 대화 모달을 실행시킬 트리거 역할을 수행합니다.

---

## 🏃 실행 방법

```bash
# 개발(기본): H2 인메모리 + 더미 시더 자동 적재
./gradlew bootRun

# 운영: MySQL + 시더 비활성 (반드시 prod 프로파일로)
SPRING_PROFILES_ACTIVE=prod DB_URL=... DB_USERNAME=... DB_PASSWORD=... ./gradlew bootRun
```

| 리소스 | 경로 |
|---|---|
| Swagger UI | `http://localhost:8080/swagger-ui.html` |
| OpenAPI JSON | `http://localhost:8080/v3/api-docs` |
| H2 콘솔(dev) | `http://localhost:8080/h2-console` (JDBC: `jdbc:h2:mem:taskmanager`) |

> **프로파일 분리**: 기본 활성 프로파일은 `dev`(H2)입니다. 운영 배포 시 `SPRING_PROFILES_ACTIVE=prod`로 덮어써야 하며,
> 더미 시더는 `@Profile("dev")` + `app.seed.enabled=true` 이중 조건으로만 동작하므로 운영 DB는 절대 오염되지 않습니다.

### 📌 도메인 용어 정리 (브리프 ↔ 구현)
- 브리프의 `status = ACTIVE`는 본 코드베이스의 **`PENDING`** 과 동일 의미입니다(미완료/조회 대상). 코드는 일관되게 `PENDING`을 사용합니다.
- 상태 변경 액션의 `IGNORED`(방치)는 도메인의 **`ARCHIVED`** 로 일원화했습니다(`TaskStatus`에 별도 `IGNORED`를 추가하지 않음).

---

## ✅ Task 1 — 더미 데이터 Seeder

`config/DataSeeder.java` (`ApplicationRunner`, `@Profile("dev")` + `@ConditionalOnProperty(app.seed.enabled=true)`)

| 시나리오 | userId | 특징 | 생성 |
|---|---|---|---|
| A. 편식 유저 (`편식러`) | 1 | 쉽고 짧은 일 완료율 ~90%, 무겁고 긴 일은 반복 SNOOZE, **좀비 2건**(delayCount 6·7) | Task 17건 |
| B. 균형 유저 (`균형러`) | 2 | 다양한 중요도/소요시간을 고르게 완료, SNOOZED 거의 없음 | Task 10건 |

- **총계: Task 27건 / UserActivityLog 42건** (요구치 20·40 충족)
- 좀비는 미룰 때마다 로그를 남겨 `delayCount` 추이가 학습 데이터에 보이도록 했습니다.

---

## ✅ Task 2 — 복합 인덱스 & 성능 측정

- 인덱스 정의: `Task` 엔티티 `@Index(idx_task_user_status_energy, columnList="user_id, status, required_energy")` (dev/H2 자동 생성)
- 운영(MySQL) DDL: [`db/migration/mysql/V2__add_task_index.sql`](src/main/resources/db/migration/mysql/V2__add_task_index.sql) — `ddl-auto: validate`이므로 DBA가 적용
- 실행계획 측정 스크립트: [`db/explain/explain_filtered_tasks.sql`](src/main/resources/db/explain/explain_filtered_tasks.sql)
- 성능 테스트: [`TaskRepositoryPerformanceTest`](src/test/java/com/teamsigma/taskmanager/repository/TaskRepositoryPerformanceTest.java) — **1,000건 적재 후 조회 평균 `0.56ms` (SLA 100ms 통과)**

### EXPLAIN ANALYZE 결과 (측정: H2, 1,000건 / 유저 20명)
대상 쿼리: `user_id=1 AND status='PENDING' AND estimated_minutes<=60 ORDER BY deadline`

| 조건 | 실행계획 (접근 경로) | rows 스캔 수 |
|---|---|---|
| 인덱스 없음 *(참고: 인덱스 못 타는 술어로 측정한 풀스캔)* | TABLE SCAN | **1,001** |
| 복합 인덱스 있음 | INDEXED — `idx_task_user_status_energy` (user_id) | **51** |
| 복합 인덱스 제거 후 | INDEXED — FK 자동 인덱스(user_id)로 폴백 | **51** |

> **정직한 측정 노트 (DBA 관점):**
> - H2 옵티마이저는 **선두 컬럼 `user_id`만으로 인덱스를 타고 `status`는 인덱스 밖에서 필터**합니다. 그래서 복합 인덱스를 떼어도 H2가 FK 컬럼에 자동 생성한 인덱스로 폴백해 동일하게 1,000→51행으로 좁힙니다(스캔 수 차이 없음).
> - 복합 인덱스의 **추가 이득**((user_id, status) 프리픽스로 51→약 15(PENDING)까지 더 좁힘)은 **운영 MySQL/InnoDB**에서 실현됩니다. 멀티컬럼 B-Tree 프리픽스를 활용하기 때문입니다.
> - MySQL 실수치는 본 환경에서 측정하지 않았으므로 표에 임의로 넣지 않았습니다. 운영에서 위 `explain_filtered_tasks.sql`의 `EXPLAIN`으로 `type=ref`, `rows` 감소를 직접 확인하십시오.

---

## ✅ Task 3 — 비동기 로그 무결성

- `TaskActivityListener`: `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("activityLogExecutor")`
- ⚠️ **수정 사항**: 기존 코드에 `@EnableAsync`가 없어 `@Async`가 무시(동기 실행)되고 있었습니다. `config/AsyncConfig`로 명시 활성화하고 전용 스레드풀을 분리했습니다.
- 무결성 테스트: [`TaskActivityIntegrationTest`](src/test/java/com/teamsigma/taskmanager/listener/TaskActivityIntegrationTest.java)
  - **[A]** 정상 커밋 → 로그 **1건** 적재 (Awaitility로 비동기 완료 대기)
  - **[B]** 트랜잭션 롤백 → 로그 **0건** (커밋되지 않으면 AFTER_COMMIT 미발화, 무결성 보장)

### 행동 로그 스냅샷 스키마
> 브리프 예시는 단일 JSON `snapshot` 컬럼을 가정했으나, 본 구현은 **정규화된 평탄 컬럼**으로 저장합니다.
> 이유: ① 엔진이 `contextEnergy`/`actionType` 등으로 집계·필터·인덱싱해야 하는데 JSON blob은 쿼리/인덱스에 불리,
> ② enum/int 타입 안정성, ③ `idx_log_user_action_time` 복합 인덱스로 학습 조회 가속.
> API(`GET /api/logs/...`) 직렬화 시 논리적으로 아래 JSON 형태가 됩니다.

```json
{
  "logId": 5001,
  "userId": 1,
  "taskId": 101,
  "actionType": "SNOOZED",          // COMPLETED | SNOOZED | ARCHIVED | ARCHIVE_REJECTED
  "contextEnergy": "LOW",            // LOW | MEDIUM | HIGH (행동 시점 유저 에너지)
  "contextAvailableMinutes": 30,     // 행동 시점 가용 시간(분)
  "taskImportance": 5,               // 1~5
  "taskEstimatedMinutes": 120,
  "taskDelayCount": 7,
  "loggedAt": "2026-05-18T00:00:00"
}
```

---

## ✅ Task 4 & 5 — REST API 스펙

전체 엔드포인트는 Swagger(`@Operation`/`@ApiResponse`)로 문서화되어 있습니다. 요약:

### ① `POST /api/tasks` — Task 생성
- Request Body: `userId`(필수), `title`(필수, ≤255), `description`(≤1000), `estimatedMinutes`(≥1), `deadline`(미래, 선택), `requiredEnergy`(LOW|MEDIUM|HIGH), `importance`(**1~5**)
- `201 Created` →
```json
{ "taskId": 101, "title": "기말 보고서 작성", "estimatedMinutes": 120,
  "requiredEnergy": "HIGH", "importance": 5, "status": "PENDING", "delayCount": 0 }
```
- `400` → 검증 실패(아래 공통 에러 포맷)

### ② `GET /api/tasks?userId=&energy=&minutes=` — 하드 컨스트레인트 필터 조회
- Query: `userId`(Long), `energy`(EnergyLevel), `minutes`(int)
- `200 OK` → `TaskResponse[]` (요구 에너지 ≤ 현재 에너지 & 예상 소요 ≤ 가용 시간, 마감 임박순)

### ③ `PATCH /api/tasks/{taskId}/status` — 상태 변경
- Request Body: `action`(**COMPLETE | SNOOZE | ARCHIVE**), `energyLevel`(필수), `availableMinutes`(≥0)
  - `energyLevel`/`availableMinutes`는 행동 시점 컨텍스트로 로그에 스냅샷됩니다.
- `200 OK` / `400` 잘못된 값 / `404` 존재하지 않는 Task

### ④ `GET /api/tasks/zombie?userId=` — 좀비 태스크 조회 *(확정 스펙)*
- `200 OK` →
```json
{
  "zombieTasks": [
    { "taskId": 101, "title": "기말 보고서 작성", "delayCount": 7,
      "estimatedMinutes": 120, "requiredEnergy": "HIGH", "importance": 5,
      "deadline": "2026-06-01T23:59:00" }
  ],
  "explorationModeFlag": false
}
```
- `explorationModeFlag`는 파이프라인이 항상 `false`로 반환하고, AdaptiveWeightEngine(이진석)이 채웁니다.

### ⑤ `GET /api/logs/user/{userId}` — 유저 행동 로그 조회 (엔진 연동)
- `200 OK` → `UserActivityLogResponse[]` (최신순, 스키마는 위 "스냅샷 스키마" 참조)

### 공통 에러 응답 포맷 (`GlobalExceptionHandler`)
```json
{
  "status": 400,
  "error": "BAD_REQUEST",
  "message": "importance는 1 이상 5 이하의 정수여야 합니다.",
  "timestamp": "2026-05-18T12:00:00"
}
```
| 상황 | status | error |
|---|---|---|
| 검증 실패 / 잘못된 인자 | 400 | BAD_REQUEST |
| 존재하지 않는 Task | 404 | NOT_FOUND |
| 처리되지 않은 예외 | 500 | INTERNAL_SERVER_ERROR |

---

## 🧪 테스트

```bash
./gradlew test   # 단위 + 통합 10개 (전부 통과)
```
주요 통합 테스트: 비동기 로그 무결성(커밋/롤백), 좀비 API E2E, 복합 인덱스 성능(1,000건 < 100ms).
