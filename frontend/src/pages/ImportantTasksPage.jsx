import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
export default function ImportantTasksPage({ onToast, search = '' }) {
  const [zombieTask, setZombieTask] = useState(null);
  const q = search.trim().toLowerCase();

  // Energy/time context is irrelevant here; pass wide defaults so nothing is
  // hidden by the (mock-bypassed) hard filter. We slice by importance instead.
  const { tasks, isLoading, error, completeTask, snoozeTask, archiveTask, restoreTask } = useTasks('HIGH', 8);

  const important = useMemo(
    () =>
      tasks
        .map(toViewModel)
        .filter((t) => t.importance >= 4)
        .filter((t) => !q || t.title.toLowerCase().includes(q))
        .sort((a, b) => Number(b.isZombie) - Number(a.isZombie) || b.importance - a.importance),
    [tasks, q]
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
            <p className="empty-state__text">
              {q ? `‘${q}’ 검색 결과가 없어요.` : '지금 중요 표시된 작업이 없습니다.'}
            </p>
          </div>
        ) : (
          <motion.div className="task-list task-list--line" variants={listContainerVariants} initial="hidden" animate="show">
            <AnimatePresence initial={false}>
              {important.map((t) => (
                <motion.div
                  key={t.id}
                  variants={listItemVariants}
                  layout
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                  style={{ overflow: 'hidden' }}
                >
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
            </AnimatePresence>
          </motion.div>
        )}
      </section>

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
