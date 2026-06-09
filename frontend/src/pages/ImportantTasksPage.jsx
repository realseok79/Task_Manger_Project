import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import TaskCard from '../components/TaskCard/TaskCard';
import ZombieModal from '../components/ZombieModal/ZombieModal';
import { useTasks } from '../hooks/useTasks';
import { toViewModel } from '../api/tasks';
import { listContainerVariants, listItemVariants } from '../hooks/useAnimations';
import './TodayTasksPage.css';

/**
 * ImportantTasksPage — high-importance PENDING tasks only (importance >= 4),
 * zombies first then importance descending. A focused list, not a dashboard.
 */
export default function ImportantTasksPage() {
  const [zombieTask, setZombieTask] = useState(null);

  // Energy/time context is irrelevant here; pass wide defaults so nothing is
  // hidden by the (mock-bypassed) hard filter. We slice by importance instead.
  const { tasks, isLoading, error, completeTask, snoozeTask, archiveTask } = useTasks('HIGH', 8);

  const important = useMemo(
    () =>
      tasks
        .map(toViewModel)
        .filter((t) => t.importance >= 4)
        .sort((a, b) => Number(b.isZombie) - Number(a.isZombie) || b.importance - a.importance),
    [tasks]
  );

  const onCardClick = (t) => {
    if (t.isZombie) setZombieTask(t);
  };

  return (
    <div className="today-page">
      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title">중요 작업</h1>
          <p className="page-subtitle">중요도가 높은 작업만 모았습니다</p>
        </div>
      </header>

      {error && <div className="page-error" role="alert">{error}</div>}

      <section className="pending-block" aria-label="중요 작업">
        {isLoading ? (
          <div className="skeleton-list">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
          </div>
        ) : important.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">지금 중요 표시된 작업이 없습니다.</p>
          </div>
        ) : (
          <motion.div className="task-list task-list--line" variants={listContainerVariants} initial="hidden" animate="show">
            {important.map((t) => (
              <motion.div key={t.id} variants={listItemVariants}>
                <TaskCard
                  variant={t.variant}
                  layout="line"
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
