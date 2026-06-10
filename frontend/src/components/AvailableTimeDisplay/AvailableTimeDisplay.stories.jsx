// Storybook CSF (미설치 시 비활성 아티팩트).
import AvailableTimeDisplay from './AvailableTimeDisplay';

export default {
  title: 'Task/AvailableTimeDisplay',
  component: AvailableTimeDisplay,
  parameters: { backgrounds: { default: 'dark' } },
};

const snap = (total, remaining, allocated) => ({ total_available: total, remaining, allocated, consumed: 0, refunded: 0 });

export const Sufficient = { args: { snapshot: snap(21600, 14400, 7200) } };           // 6h 중 4h 잔여
export const Low        = { args: { snapshot: snap(21600, 3000, 18600) } };           // <20% 빨강
export const WithRefund = { args: { snapshot: snap(21600, 14400, 7200), lastRefund: { id: 1, seconds: 1200 } } }; // +20분 환급 토스트
