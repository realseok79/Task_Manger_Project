import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, MoreVertical, Check, X, ArrowRight, RefreshCw } from 'lucide-react';
import AIInsightsBanner from '../components/AIInsightsBanner/AIInsightsBanner';
import TimerDisplay from '../components/TimerDisplay/TimerDisplay';
import { useTimer } from '../hooks/useTimer';
import { toastVariants } from '../hooks/useAnimations';
import './DashboardVariantPage.css';

const TODAY = new Date().toLocaleDateString('ko-KR', { weekday: 'long', month: 'long', day: 'numeric' });
const BRIEFING = [
  { id: 1, label: 'Q4 매출 전망 초안 작성', done: false },
  { id: 2, label: '엔지니어링팀과 동기화', done: false },
  { id: 3, label: '이메일 확인', done: true },
];
const BARS = [40, 70, 100, 55, 65, 35]; // bar heights (%) — index 2 is active
const QUOTES = [
  '명료한 사고가 명료한 행동에 앞선다.',
  '집중은 무엇을 하지 않을지 정하는 데서 시작된다.',
  '완벽함이 아니라 꾸준함이 성과를 만든다.',
];

export default function DashboardVariantPage() {
  const [briefing, setBriefing] = useState(BRIEFING);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [showToast, setShowToast] = useState(true);
  const timer = useTimer(9912, true); // 02:45:12

  const toggle = (id) => setBriefing((b) => b.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  return (
    <div className="dash-page">
      <AIInsightsBanner
        message="AI 인사이트: 오늘 생산성이 85% 더 높아요. 영향력이 큰 작업부터 시작하세요."
        ctaLabel="분석 보기"
        onCta={() => {}}
      />

      <header className="page-header anim-title-in">
        <div>
          <h1 className="page-title">오늘의 작업</h1>
          <p className="page-subtitle mono">{TODAY}</p>
        </div>
        <div className="dash-page__filters">
          <button className="btn-secondary dash-pill">필터</button>
          <button className="btn-secondary dash-pill">정렬</button>
        </div>
      </header>

      <div className="dash-grid">
        {/* Challenge card */}
        <div className="dash-challenge panel">
          <div className="dash-challenge__top">
            <span className="dash-challenge__badge">⭐ 오늘의 챌린지</span>
            <button className="task-card__check" role="checkbox" aria-checked="false" aria-label="챌린지 완료 처리" />
          </div>
          <h2 className="dash-challenge__title">전문 포트폴리오 시스템 점검</h2>
          <p className="dash-challenge__desc">
            현재 디자인 시스템 아키텍처를 심층 분석하고 기술 부채를 식별합니다.
          </p>
          <div className="dash-challenge__footer">
            <span className="task-card__sub mono">🕘 09:00 - 11:30</span>
            <span className="task-card__critical">! 중요</span>
            <span className="task-card__avatars">
              <span className="task-card__avatar" style={{ background: '#3b4ba8' }}>현</span>
              <span className="task-card__avatar" style={{ background: '#7b1fa2' }}>민</span>
            </span>
          </div>
        </div>

        {/* Weekly Briefing */}
        <div className="dash-briefing panel">
          <div className="dash-briefing__head">
            <h3>주간 브리핑</h3>
            <button className="icon-btn" aria-label="브리핑 옵션"><MoreVertical size={16} /></button>
          </div>
          <ul className="dash-briefing__list">
            {briefing.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`dash-check ${b.done ? 'is-done' : ''}`}
                  role="checkbox"
                  aria-checked={b.done}
                  onClick={() => toggle(b.id)}
                >
                  {b.done && <Check size={12} strokeWidth={3} />}
                </button>
                <span className={b.done ? 'dash-briefing__label is-done' : 'dash-briefing__label'}>{b.label}</span>
              </li>
            ))}
          </ul>
          <button className="dash-briefing__more">5개 더 보기 <ArrowRight size={14} /></button>
        </div>

        {/* Focus Intensity */}
        <div className="dash-focus panel">
          <div className="dash-focus__head">
            <div>
              <h3>집중도</h3>
              <span className="dash-focus__sub mono">실시간 세션</span>
            </div>
            <TimerDisplay value={timer.time} isRunning={timer.isRunning} size="md" />
          </div>
          <div className="dash-focus__chart" aria-hidden="true">
            {BARS.map((h, i) => (
              <span key={i} className={`dash-bar ${i === 2 ? 'is-active' : ''}`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        {/* Quote card */}
        <div className="dash-quote">
          <span className="dash-quote__mark">99</span>
          <p className="dash-quote__text">“{QUOTES[quoteIdx]}”</p>
          <div className="dash-quote__footer">
            <span className="mono">시스템 원칙 #04</span>
            <button
              className="dash-quote__refresh"
              onClick={() => setQuoteIdx((i) => (i + 1) % QUOTES.length)}
            >
              <RefreshCw size={14} /> 새로고침
            </button>
          </div>
        </div>
      </div>

      {/* FAB toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div className="dash-toast" variants={toastVariants} initial="hidden" animate="show" exit="exit" role="status">
            <Sparkles size={16} aria-hidden="true" />
            <span>✨ 새로운 도전 과제!</span>
            <button className="dash-toast__close" onClick={() => setShowToast(false)} aria-label="알림 닫기">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
