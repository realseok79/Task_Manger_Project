import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar/Sidebar';
import TopBar from './components/TopBar/TopBar';
import Toast from './components/Toast/Toast';
import SettingsModal from './components/SettingsModal/SettingsModal';
import HelpModal from './components/HelpModal/HelpModal';
import TodayTasksPage from './pages/TodayTasksPage';
import HistoryPage from './pages/HistoryPage';
import ImportantTasksPage from './pages/ImportantTasksPage';
import ArchivePage from './pages/ArchivePage';
import { useNotifications } from './hooks/useNotifications';

/**
 * App shell — sidebar + topbar + routed page area, plus app-level chrome
 * (theme, notifications, settings/help modals, toast).
 */
export default function App() {
  const [page, setPage] = useState('today'); // 'today' | 'important' | 'history'
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeRequested, setComposeRequested] = useState(false);

  // Theme: 'system' | 'light' | 'dark' (persisted); isDark is derived.
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('sigma-theme') || 'system');
  const [isDark, setIsDark] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('sigma-notif') !== 'off'
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notifications = useNotifications();
  const shownNotifications = notificationsEnabled ? notifications : [];

  useEffect(() => {
    localStorage.setItem('sigma-theme', themeMode);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const compute = () => setIsDark(themeMode === 'dark' || (themeMode === 'system' && mq.matches));
    compute();
    if (themeMode === 'system') {
      mq.addEventListener('change', compute);
      return () => mq.removeEventListener('change', compute);
    }
    return undefined;
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('sigma-notif', notificationsEnabled ? 'on' : 'off');
  }, [notificationsEnabled]);

  const showToast = useCallback((message, actionLabel, onAction) => {
    setToast({ id: Date.now(), message, actionLabel, onAction });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const navigate = (id) => {
    setPage(id);
    setDrawerOpen(false);
  };

  const requestCompose = () => {
    navigate('today');
    setComposeRequested(true);
  };

  // Global keyboard: ⌘K / Ctrl+K anywhere, plus a bare "n" outside fields.
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
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        isOpen={drawerOpen}
      />

      {drawerOpen && <div className="app-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <div className="app-main">
        <TopBar
          isDarkMode={isDark}
          notifications={shownNotifications}
          onThemeToggle={() => setThemeMode(isDark ? 'light' : 'dark')}
          onMenu={() => setDrawerOpen((o) => !o)}
          onSearch={() => {}}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <div className="page-content">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {page === 'today' && (
              <TodayTasksPage
                composeRequested={composeRequested}
                onComposeHandled={() => setComposeRequested(false)}
                onToast={showToast}
              />
            )}
            {page === 'history' && <HistoryPage />}
            {page === 'important' && <ImportantTasksPage onToast={showToast} />}
            {page === 'archive' && <ArchivePage onToast={showToast} />}
          </motion.div>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeMode={setThemeMode}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={() => setNotificationsEnabled((v) => !v)}
      />
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
