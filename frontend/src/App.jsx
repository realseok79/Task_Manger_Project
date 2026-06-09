import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar/Sidebar';
import TopBar from './components/TopBar/TopBar';
import TodayTasksPage from './pages/TodayTasksPage';
import HistoryPage from './pages/HistoryPage';
import ImportantTasksPage from './pages/ImportantTasksPage';

/**
 * App shell — sidebar + topbar + routed page area.
 * Lightweight client routing via state (no router dependency needed).
 */
export default function App() {
  const [page, setPage] = useState('today'); // 'today' | 'important' | 'history'
  const [isDark, setIsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeRequested, setComposeRequested] = useState(false); // => open the Today quick-add modal

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const navigate = (id) => {
    setPage(id);
    setDrawerOpen(false);
  };

  // Land on Today and request the quick-add composer to open.
  const requestCompose = () => {
    navigate('today');
    setComposeRequested(true);
  };

  // Global keyboard: ⌘K (Mac) / Ctrl+K (Windows) anywhere, plus a bare "n"
  // when not typing in a field. Both open the quick-add composer.
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPage('today');
        setDrawerOpen(false);
        setComposeRequested(true);
        return;
      }
      const el = e.target;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (!mod && !typing && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setPage('today');
        setDrawerOpen(false);
        setComposeRequested(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        activeItem={page}
        onNavigate={navigate}
        onAddTask={requestCompose}
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
              {page === 'today' && (
                <TodayTasksPage
                  composeRequested={composeRequested}
                  onComposeHandled={() => setComposeRequested(false)}
                />
              )}
              {page === 'history' && <HistoryPage />}
              {page === 'important' && <ImportantTasksPage />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
