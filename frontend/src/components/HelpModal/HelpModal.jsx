import Modal from '../Modal/Modal';
import { comboLabel } from '../../utils/platform';
import './HelpModal.css';

const GUIDE = [
  { t: '적응형 우선순위', d: '가용 시간·에너지를 설정하면 지금 할 수 있는 작업이 위로 올라옵니다.' },
  { t: '좀비 작업', d: '5번 이상 미뤄진 작업은 빨갛게 강조되고, 보관할지 물어봅니다.' },
  { t: '보기 · 정렬', d: '헤더의 ▦ 아이콘으로 카드/줄 보기를, ↕ 아이콘으로 정렬을 바꿉니다.' },
];

export default function HelpModal({ isOpen, onClose }) {
  const shortcuts = [
    { keys: [comboLabel('K')], desc: '새 작업 추가' },
    { keys: ['N'], desc: '새 작업 추가 (입력창 밖에서)' },
    { keys: ['Enter'], desc: '작업 추가 확정' },
    { keys: ['Esc'], desc: '창 닫기' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="도움말" maxWidth={460}>
      <section className="help-section">
        <h3 className="help-section__title">키보드 단축키</h3>
        <ul className="help-keys">
          {shortcuts.map((s) => (
            <li key={s.desc}>
              <span className="help-keys__desc">{s.desc}</span>
              <span className="help-keys__keys">
                {s.keys.map((k) => <kbd key={k}>{k}</kbd>)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="help-section">
        <h3 className="help-section__title">기능 안내</h3>
        <ul className="help-guide">
          {GUIDE.map((g) => (
            <li key={g.t}>
              <strong>{g.t}</strong>
              <span>{g.d}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="help-version mono">SIGMA · v0.1.0</p>
    </Modal>
  );
}
