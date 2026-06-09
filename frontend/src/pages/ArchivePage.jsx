import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import TagBadge from '../components/TagBadge/TagBadge';
import {
  getArchivedTasks,
  restoreTask as apiRestore,
  deleteTask as apiDelete,
  recreateTask as apiRecreate,
  toViewModel,
} from '../api/tasks';
import { listContainerVariants, listItemVariants } from '../hooks/useAnimations';
import './TodayTasksPage.css';
import './ArchivePage.css';

/**
 * ArchivePage — tasks the user hid via "보관하기". Each row can be restored to
 * the active list or permanently deleted (with a 5s undo). Destination of the
 * archive toast.
 */
export default function ArchivePage({ onToast }) {
  const [items, setItems] = useState([]); // raw tasks
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getArchivedTasks()
      .then((data) => {
        if (!alive) return;
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const drop = (id) => setItems((list) => list.filter((x) => x.taskId !== id));

  const restore = (raw) => {
    drop(raw.taskId);
    apiRestore(raw.taskId).catch(() => {});
    onToast?.('작업을 복구했어요');
  };

  const remove = (raw) => {
    drop(raw.taskId);
    apiDelete(raw.taskId).catch(() => {});
    onToast?.('작업을 삭제했어요', '실행취소', () => {
      setItems((list) => (list.some((x) => x.taskId === raw.taskId) ? list : [...list, raw]));
      apiRecreate(raw).catch(() => {});
    });
  };

  return (
    <div className="today-page archive-page">
      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title"><Archive size={24} aria-hidden="true" /> 보관함</h1>
          <p className="page-subtitle">미뤄두거나 보관한 작업이에요. 복구하면 다시 목록에 나타나요.</p>
        </div>
      </header>

      <section className="pending-block" aria-label="보관된 작업">
        {loading ? (
          <div className="skeleton-list">
            {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">보관한 작업이 없습니다.</p>
          </div>
        ) : (
          <motion.div className="archive-list" variants={listContainerVariants} initial="hidden" animate="show">
            <AnimatePresence initial={false}>
              {items.map((raw) => {
                const t = toViewModel(raw);
                return (
                  <motion.div
                    key={t.id}
                    variants={listItemVariants}
                    layout
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="archive-row">
                      <span className="archive-row__title" title={t.title}>{t.title}</span>
                      <span className="archive-row__meta">
                        {t.tags.map((tag) => <TagBadge key={tag.label} label={tag.label} category={tag.category} />)}
                        {t.dday && <TagBadge label={t.dday} category="deadline" />}
                      </span>
                      <div className="archive-row__actions">
                        <button type="button" className="archive-row__restore" onClick={() => restore(raw)}>
                          <RotateCcw size={14} aria-hidden="true" /> 복구
                        </button>
                        <button
                          type="button"
                          className="archive-row__delete"
                          onClick={() => remove(raw)}
                          aria-label={`${t.title} 영구 삭제`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </section>
    </div>
  );
}
