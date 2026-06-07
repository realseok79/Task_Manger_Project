import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar/Sidebar';
import TopBar from './components/TopBar/TopBar';
import TodayTasksPage from './pages/TodayTasksPage';
import HistoryPage from './pages/HistoryPage';
import DashboardVariantPage from './pages/DashboardVariantPage';

/**
 * App shell — sidebar + topbar + routed page area.
 * Lightweight client routing via state (no router dependency needed).
 */
export default function App() {
  const [page, setPage] = useState('today'); // 'today' | 'important' | 'history'
  const [isDark, setIsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const navigate = (id) => {
    setPage(id);
    setDrawerOpen(false);
  };

  return (
    <div className="app-container">
      <Sidebar
        activeItem={page}
        onNavigate={navigate}
        onAddTask={() => navigate('today')}
        isOpen={drawerOpen}
      />

      {/* Mobile drawer scrim */}
      {drawerOpen && <div className="app-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <div className="app-main">
        <TopBar
          isDarkMode={isDark}
          hasNotification
          onThemeToggle={() => setIsDark((d) => !d)}
          onMenu={() => setDrawerOpen((o) => !o)}
          onSearch={() => {}}
        />
        <div className="page-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {page === 'today' && <TodayTasksPage />}
              {page === 'history' && <HistoryPage />}
              {page === 'important' && <DashboardVariantPage />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
