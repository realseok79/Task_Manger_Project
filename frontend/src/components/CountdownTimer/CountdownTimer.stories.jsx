// Storybook CSF (미설치 시 비활성 아티팩트).
import CountdownTimer from './CountdownTimer';

export default {
  title: 'Timer/CountdownTimer',
  component: CountdownTimer,
  parameters: { backgrounds: { default: 'dark' } },
};

const now = Date.now();

export const Running = { args: { estimatedDuration: 1800, status: 'RUNNING', anchorMs: now - 60_000, baseElapsed: 0 } };       // 29:00 남음(파랑)
export const Warning = { args: { estimatedDuration: 1800, status: 'RUNNING', anchorMs: now - 1450_000 / 1000 * 1000, baseElapsed: 1450 } }; // <25% 주황
export const Danger  = { args: { estimatedDuration: 600, status: 'RUNNING', anchorMs: now - 550_000, baseElapsed: 0 } };       // <60초 빨강 깜박
export const Overrun = { args: { estimatedDuration: 300, status: 'RUNNING', anchorMs: now - 360_000, baseElapsed: 0 } };       // 시간 초과
export const Paused  = { args: { estimatedDuration: 1800, status: 'PAUSED', anchorMs: null, baseElapsed: 900 } };
export const Idle    = { args: { estimatedDuration: 1800, status: 'IDLE', anchorMs: null, baseElapsed: 0 } };
