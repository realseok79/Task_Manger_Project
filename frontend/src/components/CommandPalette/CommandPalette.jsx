import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Plus, Calendar, Star, Clock, Archive, CornerDownLeft } from 'lucide-react';
import { getAllPending, getArchivedTasks, getCompletedTasks, toViewModel } from '../../api/tasks';
import './CommandPalette.css';

const NAV_ITEMS = [
  { type: 'nav', page: 'today', label: '오늘의 작업', Icon: Calendar },
  { type: 'nav', page: 'important', label: '중요', Icon: Star },
  { type: 'nav', page: 'history', label: '기록', Icon: Clock },
  { type: 'nav', page: 'archive', label: '보관함', Icon: Archive },
];

/**
 * CommandPalette — global ⌘K bar: search every task (active / archived /
 * completed), jump to a page, or create a new task. Keyboard-first.
 */
export default function CommandPalette({ isOpen, onClose, onNavigate, onCreate, onPickTask }) {
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Load all tasks once when opened.
  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setSel(0);
    let alive = true;
    Promise.all([
      getAllPending().catch(() => []),
      getArchivedTasks().catch(() => []),
      getCompletedTasks().catch(() => []),
    ]).then(([pending, archived, completed]) => {
      if (!alive) return;
      setTasks([
        ...pending.map(toViewModel).map((t) => ({ id: `p-${t.id}`, title: t.title, page: 'today', label: '오늘' })),
        ...archived.map(toViewModel).map((t) => ({ id: `a-${t.id}`, title: t.title, page: 'archive', label: '보관함' })),
        ...completed.map((c) => ({ id: `c-${c.taskId}`, title: c.title, page: 'history', label: '기록' })),
      ]);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  // Focus + scroll lock.
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [isOpen]);

  const q = query.trim().toLowerCase();

  const items = useMemo(() => {
    const arr = [];
    if (q) arr.push({ type: 'create', label: query.trim() });
    NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q)).forEach((n) => arr.push(n));
    if (q) {
      tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 6).forEach((t) => arr.push({ type: 'task', ...t }));
    }
    return arr;
  }, [q, query, tasks]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector('.is-sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const activate = (item) => {
    if (!item) return;
    if (item.type === 'create') onCreate(item.label);
    else if (item.type === 'nav') onNavigate(item.page);
    else if (item.type === 'task') onPickTask(item.page, item.title);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(items[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cmdk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="cmdk"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="명령 팔레트"
          >
            <div className="cmdk__input">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="작업 검색, 이동, 또는 새 작업 추가…"
                aria-label="명령 검색"
              />
            </div>
            <ul className="cmdk__list" ref={listRef} role="listbox">
              {items.length === 0 ? (
                <li className="cmdk__empty">검색 결과가 없어요.</li>
              ) : (
                items.map((item, i) => (
                  <li
                    key={item.type === 'task' ? item.id : item.type === 'nav' ? `nav-${item.page}` : 'create'}
                    role="option"
                    aria-selected={i === sel}
                    className={`cmdk__item ${i === sel ? 'is-sel' : ''}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => activate(item)}
                  >
                    {item.type === 'create' && (
                      <>
                        <Plus size={16} />
                        <span className="cmdk__label">‘{item.label}’ 새 작업으로 추가</span>
                      </>
                    )}
                    {item.type === 'nav' && (
                      <>
                        <item.Icon size={16} />
                        <span className="cmdk__label">{item.label}</span>
                        <span className="cmdk__hint">이동</span>
                      </>
                    )}
                    {item.type === 'task' && (
                      <>
                        <Search size={15} />
                        <span className="cmdk__label">{item.title}</span>
                        <span className="cmdk__tag">{item.label}</span>
                      </>
                    )}
                    {i === sel && <CornerDownLeft size={14} className="cmdk__enter" aria-hidden="true" />}
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
