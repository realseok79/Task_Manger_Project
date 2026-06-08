import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, LayoutGrid, Lightbulb, MoreHorizontal, Plus, CornerDownLeft } from 'lucide-react';
import TaskCard from '../components/TaskCard/TaskCard';
import ContextBar from '../components/ContextBar/ContextBar';
import ZombieModal from '../components/ZombieModal/ZombieModal';
import { useTasks } from '../hooks/useTasks';
import { useTimer } from '../hooks/useTimer';
import { toViewModel } from '../api/tasks';
import { listContainerVariants, listItemVariants } from '../hooks/useAnimations';
import './TodayTasksPage.css';

const TODAY = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const ENERGY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const CATEGORIES = ['업무', '개인', '디자인', '문서', '회의', '개발', '인사'];
const COMPOSER_ENERGY = [
  { id: 'LOW', label: '낮음' },
  { id: 'MEDIUM', label: '보통' },
  { id: 'HIGH', label: '높음' },
];
const IMPORTANCE = [
  { value: 5, label: '매우 높음' },
  { value: 4, label: '높음' },
  { value: 3, label: '보통' },
  { value: 2, label: '낮음' },
  { value: 1, label: '매우 낮음' },
];

/** Derive expected priority from energy + available time (per spec). */
function computePriority(energy, time) {
  const score = ({ LOW: 0, MEDIUM: 1, HIGH: 2 }[energy] ?? 1) + (time >= 5 ? 2 : time >= 2.5 ? 1 : 0);
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

export default function TodayTasksPage({ composeSignal = 0 }) {
  const [timeAvailable, setTimeAvailable] = useState(4.5);
  const [energyLevel, setEnergyLevel] = useState('MEDIUM');
  const [quickInput, setQuickInput] = useState('');
  const [zombieTask, setZombieTask] = useState(null);

  // Composer fields (capture the model the adaptive engine actually needs).
  const [newCategory, setNewCategory] = useState('업무');
  const [newEnergy, setNewEnergy] = useState('MEDIUM');
  const [newImportance, setNewImportance] = useState(3);
  const [newDeadline, setNewDeadline] = useState('');

  const titleRef = useRef(null);

  const { tasks, isLoading, error, completeTask, snoozeTask, archiveTask, addTask } = useTasks(energyLevel, timeAvailable);
  const timer = useTimer(0, false); // idle until the user starts focusing

  const views = useMemo(() => tasks.map(toViewModel), [tasks]);
  const priorityTask = views.find((t) => t.isPriority && !t.isZombie);
  const expectedPriority = computePriority(energyLevel, timeAvailable);

  // The ContextBar drives the list: tasks that fit the current energy/time float
  // up (zombies pinned on top); the rest are de-emphasised, not hidden.
  const minutes = timeAvailable * 60;
  const pending = useMemo(
    () =>
      views
        .filter((t) => !t.isPriority || t.isZombie)
        .map((t) => ({
          ...t,
          fits: ENERGY_RANK[t.requiredEnergy] <= ENERGY_RANK[energyLevel] && t.estimatedMinutes <= minutes,
        }))
        .sort((a, b) => Number(b.isZombie) - Number(a.isZombie) || Number(b.fits) - Number(a.fits)),
    [views, energyLevel, minutes]
  );

  // Focus the composer when the sidebar "새 작업 추가" is pressed.
  useEffect(() => {
    if (!composeSignal) return;
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [composeSignal]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = quickInput.trim();
    if (!title) return;
    addTask({
      title,
      estimatedMinutes: 30,
      requiredEnergy: newEnergy,
      importance: Number(newImportance),
      category: newCategory,
      deadline: newDeadline ? new Date(`${newDeadline}T09:00:00`).toISOString() : undefined,
    });
    setQuickInput('');
    setNewDeadline('');
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
          <button className="icon-btn" aria-label="정렬"><ArrowUpDown size={18} /></button>
          <button className="icon-btn" aria-label="그리드 보기"><LayoutGrid size={18} /></button>
          <button className="icon-btn" aria-label="인사이트"><Lightbulb size={18} /></button>
          <button className="icon-btn" aria-label="더보기"><MoreHorizontal size={18} /></button>
        </div>
      </header>

      {error && <div className="page-error" role="alert">{error}</div>}

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
        {isLoading ? (
          <div className="skeleton-list">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.div className="task-list" variants={listContainerVariants} initial="hidden" animate="show">
            {pending.map((t) => (
              <motion.div key={t.id} variants={listItemVariants}>
                <TaskCard
                  variant={t.variant}
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
          </motion.div>
        )}
      </section>

      <ContextBar
        timeAvailable={timeAvailable}
        energyLevel={energyLevel}
        expectedPriority={expectedPriority}
        onChange={({ time, energy }) => {
          setTimeAvailable(time);
          setEnergyLevel(energy);
        }}
      />

      {/* Composer */}
      <form className="composer" onSubmit={handleSubmit}>
        <div className="quick-add">
          <Plus size={18} className="quick-add__icon" aria-hidden="true" />
          <input
            ref={titleRef}
            className="quick-add__input"
            placeholder="작업 추가..."
            aria-label="새 작업 제목"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
          />
          <button type="submit" className="btn-primary quick-add__btn">
            추가 <CornerDownLeft size={15} />
          </button>
        </div>

        <div className="composer__options">
          <label className="composer__field">
            <span>에너지</span>
            <select value={newEnergy} onChange={(e) => setNewEnergy(e.target.value)}>
              {COMPOSER_ENERGY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="composer__field">
            <span>카테고리</span>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="composer__field">
            <span>중요도</span>
            <select value={newImportance} onChange={(e) => setNewImportance(e.target.value)}>
              {IMPORTANCE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="composer__field">
            <span>마감</span>
            <input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
          </label>
        </div>
      </form>

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

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="empty-state__text">오늘 남은 작업이 없습니다.</p>
    </div>
  );
}
