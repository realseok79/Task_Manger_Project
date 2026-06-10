/**
 * 전역 상태 프로바이더 묶음 — 두 스토어를 연결(완료 환급 → 가용시간).
 * main.jsx 가 <App/> 을 이걸로 감싸 앱 전체에서 일관된 타이머/가용시간을 제공한다.
 */
import { AvailableTimeProvider, useAvailability } from './AvailableTimeContext';
import { TimerProvider } from './TimerContext';
import { TaskProvider } from './TaskContext';

function TimerBridge({ children }) {
  // TimerStore.completeTask 의 환급을 AvailableTimeStore 로 흘려보낸다(스토어 간 상호작용).
  const { applyEarlyCompletion } = useAvailability();
  return <TimerProvider onEarlyCompletion={applyEarlyCompletion}>{children}</TimerProvider>;
}

export default function GlobalStateProviders({ children, initialTotalSeconds = 6 * 3600 }) {
  return (
    <AvailableTimeProvider initialTotal={initialTotalSeconds}>
      <TimerBridge>
        {/* Task 목록 + 표시상태 오버레이(버튼 노출 즉시 반영). useTaskSync 가 채워질 때까지 inert. */}
        <TaskProvider>{children}</TaskProvider>
      </TimerBridge>
    </AvailableTimeProvider>
  );
}
