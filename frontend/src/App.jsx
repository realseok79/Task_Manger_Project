import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar/Sidebar';
import TopBar from './components/TopBar/TopBar';
import Toast from './components/Toast/Toast';
import SettingsModal from './components/SettingsModal/SettingsModal';
import HelpModal from './components/HelpModal/HelpModal';
import CommandPalette from './components/CommandPalette/CommandPalette';
import TodayTasksPage from './pages/TodayTasksPage';
import HistoryPage from './pages/HistoryPage';
import ImportantTasksPage from './pages/ImportantTasksPage';
import ArchivePage from './pages/ArchivePage';
import { useNotifications } from './hooks/useNotifications';
import { useDaemonIpc } from './hooks/useDaemonIpc';
import NotificationToastHost from './components/NotificationToast/NotificationToast';
import AudioActivationSettings from './components/AudioActivationSettings/AudioActivationSettings';

/**
 * App shell — sidebar + topbar + routed page area, plus app-level chrome
 * (theme, notifications, settings/help modals, toast).
 */
export default function App() {
  const [page, setPage] = useState('today'); // 'today' | 'important' | 'history' | 'archive'
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeRequest, setComposeRequest] = useState(null); // null | { title }
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Theme: 'system' | 'light' | 'dark' (persisted); isDark is derived.
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('sigma-theme') || 'system');
  const [isDark, setIsDark] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('sigma-notif') !== 'off'
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [search, setSearch] = useState('');

  const [toasts, setToasts] = useState([]);
  const [scrollTaskId, setScrollTaskId] = useState(null);

  // 실시간 알림 수신 -> 우하단 토스트 생성
  const notify = useNotifications({
    onIncoming: (n) => {
      if (notificationsEnabled) {
        setToasts((ts) => [...ts, { id: n.id, type: n.type, message: n.message, task_id: n.task_id }]);
      }
    },
  });

  const navigateToTask = (taskId) => {
    setPage('today');
    setDrawerOpen(false);
    setScrollTaskId(taskId);
  };

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

  // AudioDaemon IPC: a wake-word trigger surfaces here (primary tab only) and focuses the app.
  const onTrigger = useCallback(
    (payload) => {
      setPage('today');
      setDrawerOpen(false);
      showToast(`🎙️ 호출어가 감지되었습니다: "${payload?.wake_phrase || '음성'}"`);
      try { window.focus(); } catch { /* browsers restrict programmatic focus */ }
    },
    [showToast]
  );
  const onFocus = useCallback(() => {
    try { window.focus(); } catch { /* noop */ }
  }, []);
  useDaemonIpc({ onTrigger, onFocus });

  const navigate = (id) => {
    setPage(id);
    setDrawerOpen(false);
  };

  // Land on Today and open the quick-add composer (optionally prefilled).
  const requestCompose = (title = '') => {
    navigate('today');
    setComposeRequest({ title });
  };

  // Global keyboard: ⌘K / Ctrl+K opens the command palette anywhere; a bare "n"
  // (outside fields) opens the quick-add composer directly.
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.code === 'KeyK') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        setAudioSettingsOpen(true);
        return;
      }
      const el = e.target;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (!mod && !typing && e.code === 'KeyN') {
        e.preventDefault();
        requestCompose('');
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
          notification={{
            items: notify.items,
            unreadCount: notify.unreadCount,
            isLoading: notify.isLoading,
            hasMore: notify.hasMore,
            isLoadingMore: notify.isLoadingMore,
            onLoadMore: notify.loadMore,
            onMarkAllRead: notify.markAllRead,
            onMarkRead: notify.markRead,
            onDismiss: notify.dismiss,
            onResolve: notify.resolveDelete,
            onNavigate: navigateToTask,
          }}
          searchValue={search}
          onThemeToggle={() => setThemeMode(isDark ? 'light' : 'dark')}
          onMenu={() => setDrawerOpen((o) => !o)}
          onSearch={setSearch}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenAudioSettings={() => setAudioSettingsOpen(true)}
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
                  composeRequest={composeRequest}
                  onComposeHandled={() => setComposeRequest(null)}
                  onToast={showToast}
                  search={search}
                  scrollToTaskId={scrollTaskId}
                  onScrolled={() => setScrollTaskId(null)}
                />
              )}
              {page === 'history' && <HistoryPage search={search} />}
              {page === 'important' && <ImportantTasksPage onToast={showToast} search={search} />}
              {page === 'archive' && <ArchivePage onToast={showToast} search={search} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeMode={setThemeMode}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={() => setNotificationsEnabled((v) => !v)}
        onToast={showToast}
      />
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <AudioActivationSettings
        isOpen={audioSettingsOpen}
        onClose={() => setAudioSettingsOpen(false)}
      />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onCreate={(title) => requestCompose(title)}
        onPickTask={(targetPage, title) => {
          setSearch(title);
          navigate(targetPage);
        }}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />

      <NotificationToastHost
        toasts={toasts}
        onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))}
        onClick={navigateToTask}
      />
    </div>
  );
}
