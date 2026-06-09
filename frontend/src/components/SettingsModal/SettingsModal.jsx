import Modal from '../Modal/Modal';
import './SettingsModal.css';

const THEMES = [
  { id: 'system', label: '시스템' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
];

export default function SettingsModal({
  isOpen,
  onClose,
  themeMode,
  onThemeMode,
  notificationsEnabled,
  onToggleNotifications,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="설정" maxWidth={440}>
      <div className="app-field">
        <span className="app-field__label">테마</span>
        <div className="seg" role="radiogroup" aria-label="테마">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={themeMode === t.id}
              className={`seg__btn ${themeMode === t.id ? 'is-active' : ''}`}
              onClick={() => onThemeMode(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="app-field__hint">시스템은 OS 설정을 따릅니다.</span>
      </div>

      <div className="settings-row">
        <div>
          <span className="app-field__label">알림 표시</span>
          <span className="app-field__hint">미뤄진 작업·마감 임박을 알려줘요.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={notificationsEnabled}
          aria-label="알림 표시"
          className={`switch ${notificationsEnabled ? 'is-on' : ''}`}
          onClick={onToggleNotifications}
        >
          <span className="switch__thumb" />
        </button>
      </div>
    </Modal>
  );
}
