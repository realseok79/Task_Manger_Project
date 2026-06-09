import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, LayoutGrid, Plus, Check } from 'lucide-react';
import TaskCard from '../components/TaskCard/TaskCard';
import ContextBar from '../components/ContextBar/ContextBar';
import ZombieModal from '../components/ZombieModal/ZombieModal';
import QuickAddModal from '../components/QuickAddModal/QuickAddModal';
import { useTasks } from '../hooks/useTasks';
import { useTimer } from '../hooks/useTimer';
import { toViewModel } from '../api/tasks';
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

/** Derive expected priority from energy + available time (per spec). */
function computePriority(energy, time) {
  const score = ({ LOW: 0, MEDIUM: 1, HIGH: 2 }[energy] ?? 1) + (time >= 5 ? 2 : time >= 2.5 ? 1 : 0);
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

export default function TodayTasksPage({ composeRequest = null, onComposeHandled, onToast, search = '' }) {
  const q = search.trim().toLowerCase();
  const [timeAvailable, setTimeAvailable] = useState(4.5);
  const [energyLevel, setEnergyLevel] = useState('MEDIUM');
  const [zombieTask, setZombieTask] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [layout, setLayout] = useState('line'); // 'card' | 'line' — flat list by default
  const [sortMode, setSortMode] = useState('adaptive');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);

  const { tasks, isLoading, error, completeTask, snoozeTask, archiveTask, restoreTask, addTask } = useTasks(energyLevel, timeAvailable);
  const timer = useTimer(0, false); // idle until the user starts focusing

  const views = useMemo(() => tasks.map(toViewModel), [tasks]);
  const matchesQuery = (t) => !q || t.title.toLowerCase().includes(q);
  const priorityTask = views.find((t) => t.isPriority && !t.isZombie && matchesQuery(t));
  const expectedPriority = computePriority(energyLevel, timeAvailable);

  // The ContextBar drives the list: tasks that fit the current energy/time float
  // up (zombies pinned on top); the rest are de-emphasised, not hidden.
  const minutes = timeAvailable * 60;
  const pending = useMemo(() => {
    const base = views
      .filter((t) => !t.isPriority || t.isZombie)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .map((t) => ({
        ...t,
        fits: ENERGY_RANK[t.requiredEnergy] <= ENERGY_RANK[energyLevel] && t.estimatedMinutes <= minutes,
      }));
    if (sortMode === 'deadline') return base.sort((a, b) => ddayNum(a.dday) - ddayNum(b.dday));
    if (sortMode === 'importance') return base.sort((a, b) => b.importance - a.importance);
    // adaptive: zombies first, then tasks that fit the current energy/time
    return base.sort((a, b) => Number(b.isZombie) - Number(a.isZombie) || Number(b.fits) - Number(a.fits));
  }, [views, energyLevel, minutes, sortMode, q]);

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
      setQuickAddTitle(composeRequest.title || '');
      setQuickAddOpen(true);
      onComposeHandled?.();
    }
  }, [composeRequest, onComposeHandled]);

  const onCardClick = (t) => {
    if (t.isZombie) setZombieTask(t);
  };

  return (
    <div className="today-page">
      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title">오늘의 작업</h1>
          <p className="page-subtitle">{TODAY}</p>
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
        </div>
      </header>

      {error && <div className="page-error" role="alert">{error}</div>}

      {/* Context control — slim, above the list it reorders */}
      <ContextBar
        timeAvailable={timeAvailable}
        energyLevel={energyLevel}
        expectedPriority={expectedPriority}
        onChange={({ time, energy }) => {
          setTimeAvailable(time);
          setEnergyLevel(energy);
        }}
      />

      {/* Priority task */}
      {priorityTask && (
        <section className="priority-block anim-section-in" aria-label="최우선 과제">
          <span className="priority-block__label">최우선 과제</span>
          <TaskCard
            variant="priority"
            title={priorityTask.title}
            tags={priorityTask.tags}
            dday={priorityTask.dday}
            isTimerRunning={timer.isRunning}
            timerValue={timer.time}
            onComplete={() => completeTask(priorityTask.id)}
            onPauseTimer={timer.pause}
            onResumeTimer={timer.start}
            onStopTimer={timer.stop}
          />
        </section>
      )}

      {/* Pending */}
      <section className="pending-block" aria-label="대기 중인 작업">
        <h2 className="section-label">대기 중인 작업</h2>

        {/* Quiet inline trigger — opens the centred composer (no chat bar) */}
        <button
          type="button"
          className="add-trigger"
          onClick={() => {
            setQuickAddTitle('');
            setQuickAddOpen(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          <span>새 작업</span>
          <kbd className="add-trigger__kbd">N</kbd>
        </button>

        {isLoading ? (
          <div className="skeleton-list">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState query={q} />
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
                    onComplete={() => completeTask(t.id)}
                    onClick={t.isZombie ? () => onCardClick(t) : undefined}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      <QuickAddModal
        isOpen={quickAddOpen}
        initialTitle={quickAddTitle}
        onClose={() => setQuickAddOpen(false)}
        onAdd={addTask}
      />

      <ZombieModal
        isOpen={Boolean(zombieTask)}
        taskTitle={zombieTask?.title}
        delayCount={zombieTask?.delayCount ?? 0}
        onArchive={() => {
          archiveTask(zombieTask.id, (snap) =>
            onToast?.('보관함으로 옮겼어요', '실행취소', () => restoreTask(snap))
          );
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

function EmptyState({ query }) {
  return (
    <div className="empty-state">
      <p className="empty-state__text">
        {query ? `‘${query}’ 검색 결과가 없어요.` : '오늘 남은 작업이 없습니다.'}
      </p>
    </div>
  );
}
