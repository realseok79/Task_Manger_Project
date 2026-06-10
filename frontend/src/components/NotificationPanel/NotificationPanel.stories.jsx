// Storybook CSF (Storybook 미설치 시 비활성 아티팩트).
import NotificationPanel from './NotificationPanel';

export default {
  title: 'Notifications/NotificationPanel',
  component: NotificationPanel,
  parameters: { backgrounds: { default: 'dark' } },
};

const items = [
  { id: 'n-1', task_id: 2, type: 'OVERDUE_1DAY', is_read: false, message: '마케팅 캠페인 시안 리뷰가 하루 미뤄졌습니다.' },
  { id: 'n-2', task_id: 3, type: 'OVERDUE_2DAY', is_read: false, message: '개인 사이드 프로젝트 코드 클린업이 이틀 지났습니다.' },
  { id: 'n-3', task_id: 4, type: 'DELETE_CONFIRM', is_read: false, message: '정기 구독 서비스 결제 수단 갱신을 투두리스트에서 없앨까요?' },
];

export const WithItems = { args: { items, unreadCount: 3, isLoading: false } };
export const Empty = { args: { items: [], unreadCount: 0, isLoading: false } };
export const Loading = { args: { items: [], unreadCount: 0, isLoading: true } };
