import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, LayoutGrid, Plus, Check, CornerDownLeft, PictureInPicture2 } from 'lucide-react';
import TaskCard from '../components/TaskCard/TaskCard';
import ContextBar from '../components/ContextBar/ContextBar';
import ZombieModal from '../components/ZombieModal/ZombieModal';
import TaskCreationModal from '../components/TaskCreationModal/TaskCreationModal';
import AvailableTimeDisplay from '../components/AvailableTimeDisplay/AvailableTimeDisplay';
import EmptyState from '../components/EmptyState/EmptyState';
import MiniTasks from '../components/MiniTasks/MiniTasks';
import { useTasks } from '../hooks/useTasks';
import { useAvailableTime } from '../hooks/useAvailableTime';
import { useTaskRuntime } from '../hooks/useTaskRuntime';
import { toViewModel } from '../api/tasks';
import { deriveDisplayStatus } from '../lib/displayStatus';
import { createTaskWithBudget, completeTaskWithRefund } from '../api/availableTime';
import { appendCompleted } from '../lib/storage';
import { listContainerVariants, listItemVariants } from '../hooks/useAnimations';
import './TodayTasksPage.css';

const TODAY = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const ENERGY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

const SORTS = [
  { id: 'adaptive', label: '적응형(기본)' },
  { id: 'deadline', label: '마감 임박순' },
  { id: 'importance', label: '중요도순' },
];

/** Parse a D-day label to a sortable number (overdue first, then nearest). */
function ddayNum(dday) {
  if (!dday) return 9999;
  if (dday === 'D-DAY') return 0;
  const m = dday.match(/D([+-])(\d+)/);
  return m ? (m[1] === '-' ? 1 : -1) * Number(m[2]) : 9999;
}

const PIP_SUPPORTED = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/** Clone the app's stylesheets into a PiP window so the widget is themed. */
function copyStylesTo(target) {
  for (const sheet of document.styleSheets) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const style = target.document.createElement('style');
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
  target.document.documentElement.setAttribute(
    'data-theme',
    document.documentElement.getAttribute('data-theme') || 'light'
  );
}

/** Derive expected priority from energy + available time (per spec). */
function computePriority(energy, time) {
  const score = ({ LOW: 0, MEDIUM: 1, HIGH: 2 }[energy] ?? 1) + (time >= 5 ? 2 : time >= 2.5 ? 1 : 0);
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

export default function TodayTasksPage({
  composeRequest = null,
  onComposeHandled,
  onToast,
  search = '',
  scrollToTaskId,
  onScrolled,
}) {
  const q = search.trim().toLowerCase();
  const [timeAvailable, setTimeAvailable] = useState(4.5);
  const [energyLevel, setEnergyLevel] = useState('MEDIUM');
  const [zombieTask, setZombieTask] = useState(null);
  
  // 빠른 추가(하단 인풋) 관련
  const [quickInput, setQuickInput] = useState('');
  
  // 상세 추가 모달 관련
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState(null);
  
  // 정렬 & 레이아웃 관련
  const [layout, setLayout] = useState('line'); // 'card' | 'line' — flat list by default
  const [sortMode, setSortMode] = useState('adaptive');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);

  // 미니 위젯(PiP) 관련
  const [pipWindow, setPipWindow] = useState(null);
  const pipRef = useRef(null);

  // 가용 시간 및 진행 관리
  const avail = useAvailableTime();
  const runtime = useTaskRuntime();
  const [lastRefund, setLastRefund] = useState(null);

  const { tasks, isLoading, error, refetch: refetchTasks, completeTask, snoozeTask, archiveTask } = useTasks(energyLevel, timeAvailable);

  const views = useMemo(() => tasks.map(toViewModel), [tasks]);
  const matchesQuery = (t) => !q || t.title.toLowerCase().includes(q);
  const priorityTask = views.find((t) => t.isPriority && !t.isZombie && matchesQuery(t));
  
  // 최우선 과제 단일성: 완료되지 않은 최우선 과제가 이미 있으면 신규 차단
  const hasPriorityTask = views.some((t) => t.isPriority && t.status !== 'COMPLETED');
  const isEmpty = !isLoading && views.length === 0;
  const isSearchEmpty = q && !priorityTask && views.filter((t) => !t.isPriority || t.isZombie).filter(matchesQuery).length === 0;

  const expectedPriority = computePriority(energyLevel, timeAvailable);

  // ContextBar 에 맞춘 가중치 필터
  const minutes = timeAvailable * 60;
  const pending = useMemo(() => {
    const base = views
      .filter((t) => !t.isPriority || t.isZombie)
      .filter(matchesQuery)
      .map((t) => ({
        ...t,
        fits: ENERGY_RANK[t.requiredEnergy] <= ENERGY_RANK[energyLevel] && t.estimatedMinutes <= minutes,
      }));
    if (sortMode === 'deadline') return base.sort((a, b) => ddayNum(a.dday) - ddayNum(b.dday));
    if (sortMode === 'importance') return base.sort((a, b) => b.importance - a.importance);
    // adaptive: zombies first, then tasks that fit the current energy/time
    return base.sort((a, b) => Number(b.isZombie) - Number(a.isZombie) || Number(b.fits) - Number(a.fits));
  }, [views, energyLevel, minutes, sortMode, q]);

  const closeAdd = () => { setAddOpen(false); setServerError(null); };

  // Close the sort menu on outside click / Escape.
  useEffect(() => {
    if (!sortOpen) return undefined;
    const onDown = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setSortOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen]);

  // Open the composer when requested (sidebar button, "n", or palette create).
  useEffect(() => {
    if (composeRequest) {
      setAddOpen(true);
      onComposeHandled?.();
    }
  }, [composeRequest, onComposeHandled]);

  // Close the always-on-top mini widget if the page unmounts.
  useEffect(() => () => pipRef.current?.close?.(), []);

  // Open (or close) the mini widget. Chrome/Edge get a true always-on-top
  // Document PiP window; other browsers get a small popup parked on the right.
  const toggleMiniWidget = async () => {
    if (pipRef.current) {
      pipRef.current.close();
      return;
    }
    try {
      let w;
      const width = 320;
      const height = 460;
      if (PIP_SUPPORTED) {
        w = await window.documentPictureInPicture.requestWindow({ width, height });
      } else {
        const left = Math.max(0, (window.screen?.availWidth || 1280) - width - 24);
        w = window.open('', 'sigmaMiniWidget', `popup=yes,width=${width},height=${height},left=${left},top=90`);
        if (!w) {
          onToast?.('팝업이 차단됐어요. 팝업 허용 후 다시 시도해 주세요.');
          return;
        }
        w.document.body.innerHTML = '';
      }
      copyStylesTo(w);
      try { w.document.title = '오늘의 작업'; } catch { /* ignore */ }
      w.addEventListener('pagehide', () => {
        pipRef.current = null;
        setPipWindow(null);
      });
      pipRef.current = w;
      setPipWindow(w);
    } catch {
      onToast?.('미니 위젯을 열 수 없어요.');
    }
  };

  // 알림 클릭 → 해당 Task 카드로 스크롤 + 잠깐 하이라이트
  useEffect(() => {
    if (!scrollToTaskId) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(`task-${scrollToTaskId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('task-card--flash');
        setTimeout(() => el.classList.remove('task-card--flash'), 1600);
      }
      onScrolled?.();
    }, 180); // 페이지 전환/렌더 후 탐색
    return () => clearTimeout(t);
  }, [scrollToTaskId, onScrolled]);

  const estSecondsOf = (t) => {
    const raw = tasks.find((rt) => rt.taskId === t.id);
    return raw?.estimatedDuration ?? (raw?.estimatedMinutes ?? t.estimatedMinutes ?? 30) * 60;
  };

  // 완료: 런타임 종료 → 기록 저장 → 가용시간 환급(조기완료) → 목록에서 제거
  const handleFinish = async (t, elapsedSeconds) => {
    const fin = runtime.finish(t.id);
    const elapsed = elapsedSeconds ?? fin.elapsedSeconds;
    const raw = tasks.find((rt) => rt.taskId === t.id);
    const now = new Date();
    appendCompleted({
      taskId: t.id,
      title: t.title,
      category: raw?.category ?? '업무',
      completedAt: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      date: now.toISOString().slice(0, 10),
      elapsedSeconds: elapsed,
    });
    try {
      const res = await completeTaskWithRefund(t.id, elapsed);
      if (res?.refunded_seconds > 0) setLastRefund({ id: Date.now(), seconds: res.refunded_seconds });
      avail.refetch();
    } catch (e) {
      console.error('Refund failed:', e);
    }
    completeTask(t.id); // 목록 낙관적 제거
  };

  const handleCompleteFromMini = (taskId) => {
    const t = views.find((x) => x.id === taskId);
    if (t) handleFinish(t);
  };

  // 카운트다운 타이머 props (estimated_duration 에서 0으로 내려감)
  const countdownProps = (t) => {
    const entry = runtime.get(t.id);
    return {
      estimatedDuration: estSecondsOf(t),
      status: entry.status,
      anchorMs: entry.runStartMs,
      baseElapsed: entry.elapsedSeconds,
      onStart: () => runtime.start(t.id),
      onPause: () => runtime.pause(t.id),
      onResume: () => runtime.resume(t.id),
      onComplete: (elapsed) => handleFinish(t, elapsed),
    };
  };

  // displayStatus 기반 제어 버튼(IDLE/ACTIVE/PAUSED/OVERDUE)
  const actionsProps = (t) => ({
    status: deriveDisplayStatus(t, runtime.get(t.id).status),
    onStart: () => runtime.start(t.id),
    onPause: () => runtime.pause(t.id),
    onResume: () => runtime.resume(t.id),
    onFinish: () => handleFinish(t),
  });

  // 상세 추가 생성 (가용시간 예산 검증). 409 → 모달 배너.
  const handleCreate = async (payload) => {
    setCreating(true);
    setServerError(null);
    try {
      await createTaskWithBudget({
        title: payload.title,
        category: payload.category,
        deadline: payload.deadline,
        estimated_duration: payload.estimated_duration,
        importance: payload.isPriority ? 5 : 3,
        isPriority: Boolean(payload.isPriority),
        requiredEnergy: energyLevel,
      });
      await refetchTasks();
      avail.refetch();
      setAddOpen(false);
    } catch (e) {
      setServerError(e?.code === 'INSUFFICIENT_AVAILABLE_TIME' ? e : { message: e?.message || '작업 생성에 실패했어요.' });
    } finally {
      setCreating(false);
    }
  };

  // 빠른 추가
  const handleSubmit = (e) => {
    e.preventDefault();
    const title = quickInput.trim();
    if (!title) return;
    handleCreate({
      title,
      category: '업무',
      deadline: null,
      estimated_duration: 30 * 60,
    });
    setQuickInput('');
  };

  const onCardClick = (t) => {
    if (t.isZombie) setZombieTask(t);
  };

  return (
    <div className="today-page">
      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title">오늘의 작업</h1>
          <p className="page-subtitle mono">{TODAY}</p>
        </div>
        <div className="page-header__actions">
          <div className="header-menu" ref={sortRef}>
            <button
              className={`icon-btn ${sortOpen || sortMode !== 'adaptive' ? 'is-active' : ''}`}
              aria-label="정렬"
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((o) => !o)}
            >
              <ArrowUpDown size={18} />
            </button>
            {sortOpen && (
              <ul className="header-menu__list" role="menu" aria-label="정렬 기준">
                {SORTS.map((s) => (
                  <li key={s.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortMode === s.id}
                      className={`header-menu__item ${sortMode === s.id ? 'is-selected' : ''}`}
                      onClick={() => { setSortMode(s.id); setSortOpen(false); }}
                    >
                      <span>{s.label}</span>
                      {sortMode === s.id && <Check size={14} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className={`icon-btn ${layout === 'line' ? 'is-active' : ''}`}
            aria-label={layout === 'line' ? '카드 보기로 전환' : '목록 보기로 전환'}
            aria-pressed={layout === 'line'}
            onClick={() => setLayout((l) => (l === 'card' ? 'line' : 'card'))}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className={`icon-btn ${pipWindow ? 'is-active' : ''}`}
            aria-label="미니 위젯 (항상 위에 떠 있는 작은 창)"
            aria-pressed={Boolean(pipWindow)}
            onClick={toggleMiniWidget}
          >
            <PictureInPicture2 size={18} />
          </button>
        </div>
      </header>

      {error && <div className="page-error" role="alert">{error}</div>}

      {/* 작업이 하나도 없을 때(로딩 제외): 중앙 CTA */}
      <AnimatePresence>
        {isEmpty && <EmptyState key="empty" onAddTask={() => setAddOpen(true)} />}
      </AnimatePresence>

      {isSearchEmpty && (
        <div className="empty-state">
          <p className="empty-state__text">‘{search}’ 검색 결과가 없어요.</p>
        </div>
      )}

      {/* Priority task */}
      {!isEmpty && !isSearchEmpty && priorityTask && (
        <section className="priority-block anim-section-in" aria-label="최우선 과제" id={`task-${priorityTask.id}`}>
          <span className="priority-block__label">🔥 최우선 과제</span>
          <TaskCard
            variant="priority"
            title={priorityTask.title}
            tags={priorityTask.tags}
            dday={priorityTask.dday}
            countdown={countdownProps(priorityTask)}
            actions={actionsProps(priorityTask)}
          />
        </section>
      )}

      {/* Pending */}
      {!isEmpty && !isSearchEmpty && (
        <section className="pending-block" aria-label="대기 중인 작업">
          <h2 className="section-label">대기 중인 작업</h2>

          {isLoading ? (
            <div className="skeleton-list">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
            </div>
          ) : pending.length === 0 ? (
            <NoPendingHint />
          ) : (
            <motion.div
              className={`task-list ${layout === 'line' ? 'task-list--line' : ''}`}
              variants={listContainerVariants}
              initial="hidden"
              animate="show"
            >
              <AnimatePresence initial={false}>
                {pending.map((t) => (
                  <motion.div
                    key={t.id}
                    id={`task-${t.id}`}
                    variants={listItemVariants}
                    layout
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                    style={{ overflow: 'hidden' }}
                  >
                    <TaskCard
                      variant={t.variant}
                      layout={layout}
                      title={t.title}
                      tags={t.tags}
                      dday={t.dday}
                      scheduledTime={t.scheduledTime}
                      delayedFrom={t.delayedFrom}
                      delayCount={t.delayCount}
                      dimmed={!t.fits && !t.isZombie}
                      onClick={t.isZombie ? () => onCardClick(t) : undefined}
                      countdown={countdownProps(t)}
                      actions={actionsProps(t)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      )}

      {pipWindow &&
        createPortal(
          <MiniTasks priorityTask={priorityTask} pending={pending} onComplete={handleCompleteFromMini} />,
          pipWindow.document.body
        )}

      {!isEmpty && !isSearchEmpty && (
        <AvailableTimeDisplay
          snapshot={avail.snapshot}
          isLoading={avail.isLoading}
          onUpdateAvailable={avail.updateAvailable}
          lastRefund={lastRefund}
        />
      )}

      {!isEmpty && !isSearchEmpty && (
        <ContextBar
          timeAvailable={timeAvailable}
          energyLevel={energyLevel}
          expectedPriority={expectedPriority}
          onChange={({ time, energy }) => {
            setTimeAvailable(time);
            setEnergyLevel(energy);
          }}
        />
      )}

      {!isEmpty && !isSearchEmpty && (
        <form className="quick-add" onSubmit={handleSubmit}>
          <Plus size={18} className="quick-add__icon" aria-hidden="true" />
          <input
            className="quick-add__input"
            placeholder="작업 추가..."
            aria-label="새 작업 빠른 추가"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
          />
          <button type="submit" className="btn-primary quick-add__btn">
            추가 <CornerDownLeft size={15} />
          </button>
        </form>
      )}

      <TaskCreationModal
        isOpen={addOpen}
        onClose={closeAdd}
        onSubmit={handleCreate}
        serverError={serverError}
        onClearServerError={() => setServerError(null)}
        submitting={creating}
        hasPriorityTask={hasPriorityTask}
        priorityTaskTitle={priorityTask?.title}
        initialTitle={composeRequest?.title || ''}
      />

      <ZombieModal
        isOpen={Boolean(zombieTask)}
        taskTitle={zombieTask?.title}
        delayCount={zombieTask?.delayCount ?? 0}
        onArchive={() => {
          archiveTask(zombieTask.id);
          setZombieTask(null);
        }}
        onKeep={() => {
          snoozeTask(zombieTask.id);
          setZombieTask(null);
        }}
        onClose={() => setZombieTask(null)}
      />
    </div>
  );
}

function NoPendingHint() {
  return (
    <div className="empty-state">
      <span className="empty-state__emoji" aria-hidden="true">🎉</span>
      <p className="empty-state__text">대기 중인 작업이 없어요. 멋진 하루예요!</p>
    </div>
  );
}
