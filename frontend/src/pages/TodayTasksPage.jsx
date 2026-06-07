import { useMemo, useState } from 'react';
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

/** Derive expected priority from energy + available time (per spec). */
function computePriority(energy, time) {
  const score = ({ LOW: 0, MEDIUM: 1, HIGH: 2 }[energy] ?? 1) + (time >= 5 ? 2 : time >= 2.5 ? 1 : 0);
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

export default function TodayTasksPage() {
  const [timeAvailable, setTimeAvailable] = useState(4.5);
  const [energyLevel, setEnergyLevel] = useState('MEDIUM');
  const [quickInput, setQuickInput] = useState('');
  const [zombieTask, setZombieTask] = useState(null);

  const { tasks, isLoading, error, completeTask, snoozeTask, archiveTask, addTask } = useTasks(energyLevel, timeAvailable);
  const timer = useTimer(2712, true); // 00:45:12

  const views = useMemo(() => tasks.map(toViewModel), [tasks]);
  const priorityTask = views.find((t) => t.isPriority && !t.isZombie);
  const pending = views.filter((t) => !t.isPriority || t.isZombie);
  const expectedPriority = computePriority(energyLevel, timeAvailable);

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = quickInput.trim();
    if (!title) return;
    addTask({ title, estimatedMinutes: 30, requiredEnergy: energyLevel, importance: 3 });
    setQuickInput('');
  };

  const onCardClick = (t) => {
    if (t.isZombie) setZombieTask(t);
  };

  return (
    <div className="today-page">
      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title">☀️ 오늘의 작업</h1>
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
          <span className="priority-block__label">🔥 최우선 과제</span>
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

      {/* Quick add */}
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
      <span className="empty-state__emoji" aria-hidden="true">🎉</span>
      <p className="empty-state__text">오늘 처리할 작업이 없어요. 멋진 하루예요!</p>
    </div>
  );
}
