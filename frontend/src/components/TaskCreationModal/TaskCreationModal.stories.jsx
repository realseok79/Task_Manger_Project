// Storybook CSF (미설치 시 비활성 아티팩트).
import TaskCreationModal from './TaskCreationModal';

export default {
  title: 'Task/TaskCreationModal',
  component: TaskCreationModal,
  parameters: { backgrounds: { default: 'dark' } },
};

export const Default = { args: { isOpen: true, serverError: null } };

export const InsufficientBudget = {
  args: {
    isOpen: true,
    serverError: { code: 'INSUFFICIENT_AVAILABLE_TIME', remaining_seconds: 1800, requested_seconds: 5400 },
  },
};

export const Submitting = { args: { isOpen: true, serverError: null, submitting: true } };

// 최우선 과제가 이미 존재 → 토글 비활성 + 빨간 경고 배너
export const PriorityBlocked = { args: { isOpen: true, serverError: null, hasPriorityTask: true } };
