import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal';
import { DEFAULT_USER_ID } from '../../api/client';
import { getWeights, resetWeights } from '../../api/users';
import './SettingsModal.css';

const THEMES = [
  { id: 'system', label: '시스템' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
];

const WEIGHT_LABELS = [
  { key: 'w1', label: '중요도' },
  { key: 'w2', label: '긴급도' },
  { key: 'w3', label: '지연' },
];

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;

export default function SettingsModal({
  isOpen,
  onClose,
  themeMode,
  onThemeMode,
  notificationsEnabled,
  onToggleNotifications,
  onToast,
}) {
  const [weights, setWeights] = useState(null);
  const [resetting, setResetting] = useState(false);

  // Load current weights each time the modal opens.
  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setWeights(null);
    getWeights(DEFAULT_USER_ID)
      .then((w) => alive && setWeights(w))
      .catch(() => alive && setWeights(null));
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const handleResetWeights = async () => {
    setResetting(true);
    try {
      const next = await resetWeights(DEFAULT_USER_ID);
      setWeights(next);
      onToast?.('우선순위 가중치를 기본값으로 초기화했어요.');
    } catch (e) {
      onToast?.(e?.message || '초기화에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setResetting(false);
    }
  };

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

      <div className="settings-row">
        <div>
          <span className="app-field__label">우선순위 가중치</span>
          <span className="app-field__hint">
            {weights
              ? WEIGHT_LABELS.map((w) => `${w.label} ${pct(weights[w.key])}`).join(' · ')
              : '학습된 가중치를 불러오는 중…'}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleResetWeights}
          disabled={resetting || !weights}
        >
          {resetting ? '초기화 중…' : '기본값으로 초기화'}
        </button>
      </div>
    </Modal>
  );
}
