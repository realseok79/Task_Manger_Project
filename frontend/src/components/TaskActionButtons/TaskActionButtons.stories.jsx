// Storybook CSF (미설치 시 비활성 아티팩트). 상태별 버튼 세트.
import TaskActionButtons from './TaskActionButtons';

export default {
  title: 'Task/TaskActionButtons',
  component: TaskActionButtons,
  parameters: { backgrounds: { default: 'dark' } },
};

const noop = { onStart: () => {}, onPause: () => {}, onResume: () => {}, onFinish: () => {} };

export const Idle = { args: { status: 'IDLE', ...noop } };       // [시작하기]
export const Active = { args: { status: 'ACTIVE', ...noop } };    // [중지][끝내기]
export const Paused = { args: { status: 'PAUSED', ...noop } };    // [이어서 시작하기][끝내기]
export const Overdue = { args: { status: 'OVERDUE', ...noop } };  // [이어서 시작하기][끝내기]
export const Completed = { args: { status: 'COMPLETED', ...noop } }; // 버튼 없음(null)
