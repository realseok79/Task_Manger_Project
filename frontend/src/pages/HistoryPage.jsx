import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import SummaryBar from '../components/SummaryBar/SummaryBar';
import FilterTabs from '../components/FilterTabs/FilterTabs';
import TaskCard from '../components/TaskCard/TaskCard';
import { getCompletedTasks } from '../api/tasks';
import { loadCompleted } from '../lib/storage';
import './HistoryPage.css';

const TABS = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
];

const CATEGORY_CODE = { 문서: 'document', 디자인: 'design', 회의: 'meeting', 개발: 'dev', 인사: 'hr', 업무: 'work', 개인: 'personal' };
const dateOf = (s) => new Date(`${s}T00:00:00`);

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getCompletedTasks().then((remote) => {
      if (!alive) return;
      // 로컬에서 방금 '끝내기'한 작업(실제 제목)을 우선하고, 백엔드 결과를 taskId로 중복 제거해 병합.
      const local = loadCompleted();
      const seen = new Set(local.map((i) => i.taskId));
      setItems([...local, ...remote.filter((r) => !seen.has(r.taskId))]);
      setIsLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Treat the most recent completed date as the reference "today" so the demo
  // filters/labels are meaningful against fixed mock dates.
  const refDate = useMemo(
    () => (items.length ? items.map((i) => dateOf(i.date)).sort((a, b) => b - a)[0] : new Date()),
    [items]
  );

  const filtered = useMemo(() => {
    if (activeTab === 'all') return items;
    return items.filter((i) => {
      const d = dateOf(i.date);
      const diffDays = Math.round((refDate - d) / 86400000);
      if (activeTab === 'today') return diffDays === 0;
      if (activeTab === 'week') return diffDays >= 0 && diffDays < 7;
      if (activeTab === 'month') return d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
      return true;
    });
  }, [items, activeTab, refDate]);

  // Group by date, newest first.
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((i) => {
      if (!map.has(i.date)) map.set(i.date, []);
      map.get(i.date).push(i);
    });
    return [...map.entries()].sort((a, b) => dateOf(b[0]) - dateOf(a[0]));
  }, [filtered]);

  // Factual count: tasks completed within the last 7 days (relative to refDate).
  const weekCount = useMemo(
    () => items.filter((i) => {
      const diff = Math.round((refDate - dateOf(i.date)) / 86400000);
      return diff >= 0 && diff < 7;
    }).length,
    [items, refDate]
  );

  const groupLabel = (dateStr) => {
    const diff = Math.round((refDate - dateOf(dateStr)) / 86400000);
    const pretty = dateOf(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    if (diff === 0) return `오늘 — ${pretty}`;
    if (diff === 1) return `어제 — ${pretty}`;
    return pretty;
  };

  return (
    <div className="history-page">
      <header className="page-header anim-title-in">
        <h1 className="page-title"><History size={26} aria-hidden="true" /> 완료된 작업</h1>
      </header>

      {!isLoading && weekCount > 0 && (
        <SummaryBar message={`이번 주에 ${weekCount}개의 작업을 완료했습니다.`} />
      )}

      <FilterTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {isLoading ? (
        <div className="history-page__skeletons">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__text">해당 기간에 완료된 작업이 없습니다.</p>
        </div>
      ) : (
        groups.map(([date, rows]) => (
          <section key={date} className="history-group">
            <h2 className="history-group__header mono">{groupLabel(date)}</h2>
            <div className="history-group__rows">
              {rows.map((row) => (
                <TaskCard
                  key={row.taskId}
                  variant="completed"
                  title={row.title}
                  completedAt={row.completedAt}
                  tags={[{ label: row.category, category: CATEGORY_CODE[row.category] ?? 'neutral' }]}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
