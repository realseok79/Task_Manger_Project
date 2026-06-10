// Storybook CSF (미설치 시 비활성 아티팩트).
import EmptyState from './EmptyState';

export default {
  title: 'Task/EmptyState',
  component: EmptyState,
  parameters: { backgrounds: { default: 'dark' } },
};

export const Default = { args: { onAddTask: () => {} } };
