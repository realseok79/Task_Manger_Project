# SIGMA Adaptive Task Manager — Frontend

TeamSigma 백엔드(Spring Boot)와 연동되는 React 프런트엔드. 화면/문구는 모두 **한글**.

## 실행

```bash
cd frontend
npm install

# 1) 목 데이터로 단독 실행 (백엔드 불필요) — .env.development 기본값
npm run dev          # http://localhost:5173

# 2) 실제 백엔드 연동 (Spring Boot가 :8080에서 실행 중일 때)
#    .env.development 에서 VITE_USE_MOCK=false 로 변경 후
npm run dev          # /api 요청은 vite 프록시로 8080 으로 전달됨

# 프로덕션 빌드
npm run build && npm run preview
```

> Node 18+ 필요. (이 저장소에는 빌드 산출물을 커밋하지 않음 — `.gitignore` 참고)

## 백엔드 연동 (api/tasks.js)

| 기능 | 엔드포인트 |
|------|-----------|
| 가용 작업 조회 | `GET /api/tasks?userId=&energy=&minutes=` |
| 작업 생성 | `POST /api/tasks` |
| 상태 변경 | `PATCH /api/tasks/{id}/status` (`COMPLETE`/`SNOOZE`/`ARCHIVE`) |
| 좀비 조회 | `GET /api/tasks/zombie?userId=` |
| 완료 로그 | `GET /api/logs/user/{userId}` |

`VITE_USE_MOCK=true` 면 동일한 응답 스키마(`TaskResponse` 등)를 반환하는 인메모리 목으로 동작합니다.
UI 컴포넌트는 `toViewModel()`을 거친 뷰모델만 사용하므로 목/실 API 전환이 투명합니다.

## 구조

```
src/
  design-system.css      디자인 토큰 + 컴포넌트 베이스 + 다크모드 + 반응형
  animations.css         키프레임/트랜지션 (prefers-reduced-motion 대응)
  hooks/                 useAnimations, useTasks(낙관적 업데이트), useTimer
  api/                   client(axios) · tasks(매핑) · mock(인메모리)
  components/            TagBadge·TaskCard·TimerDisplay·Sidebar·ContextBar·
                         ZombieModal·TopBar·AIInsightsBanner·FilterTabs
  pages/                 TodayTasksPage · HistoryPage · DashboardVariantPage
  App.jsx                사이드바+탑바 레이아웃, 페이지 라우팅, 테마 토글
```

네비게이션 ↔ 화면 매핑: **오늘의 작업** → Today, **중요** → Dashboard 변형, **기록** → History.

## 원본 스펙 대비 조정 사항

- **Vite** 사용 (스펙의 `react-scripts`/CRA는 현재 Node에서 설치가 불안정). 환경변수는 `VITE_` 접두사.
- **순수 CSS + CSS 변수**로 구현 (상세 스펙이 Tailwind가 아닌 `design-system.css` 토큰 방식을 명시).
- 참고 디자인이 영문/한글 혼용이라, 요청에 따라 **모든 사용자 노출 문구를 한글로** 통일 (브랜드 `SIGMA`만 유지).
- 백엔드 `UserActivityLog`에는 작업 제목/카테고리가 없어, 기록 화면은 목에서 풍부한 데이터를 제공하고
  실 API 연동 시에는 제목을 `작업 #{id}`로 대체(백엔드 한계 명시).
