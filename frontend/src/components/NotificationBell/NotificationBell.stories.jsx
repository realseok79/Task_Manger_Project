// Storybook CSF (Storybook 미설치 시 비활성 아티팩트).
import NotificationBell from './NotificationBell';

export default {
  title: 'Notifications/NotificationBell',
  component: NotificationBell,
  parameters: { backgrounds: { default: 'dark' } },
};

const items = [
  { id: 'n-1', task_id: 2, type: 'OVERDUE_1DAY', is_read: false, message: '마케팅 캠페인 시안 리뷰가 하루 미뤄졌습니다.' },
  { id: 'n-2', task_id: 3, type: 'OVERDUE_2DAY', is_read: false, message: '개인 사이드 프로젝트 코드 클린업이 이틀 지났습니다.' },
];

export const NoUnread = { args: { items: [], unreadCount: 0, isLoading: false } };
export const WithUnread = { args: { items, unreadCount: 2, isLoading: false } };
export const ManyUnread = { args: { items, unreadCount: 128, isLoading: false } }; // 99+ 처리
export const Loading = { args: { items: [], unreadCount: 0, isLoading: true } };
