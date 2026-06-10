// Storybook CSF (Storybook 미설치 시 비활성 아티팩트). 설치 후 그대로 동작.
import NotificationItem from './NotificationItem';

export default {
  title: 'Notifications/NotificationItem',
  component: NotificationItem,
  parameters: { backgrounds: { default: 'dark' } },
};

const base = { id: 'n-1', task_id: 2, is_read: false, created_at: new Date().toISOString() };

export const Overdue1Day = {
  args: { notification: { ...base, type: 'OVERDUE_1DAY', message: '마케팅 캠페인 시안 리뷰가 하루 미뤄졌습니다.' } },
};

export const Overdue2Day = {
  args: { notification: { ...base, id: 'n-2', type: 'OVERDUE_2DAY', message: '개인 사이드 프로젝트 코드 클린업이 이틀 지났습니다.' } },
};

export const DeleteConfirm = {
  args: { notification: { ...base, id: 'n-3', type: 'DELETE_CONFIRM', message: '정기 구독 서비스 결제 수단 갱신을 투두리스트에서 없앨까요?' } },
};

export const Read = {
  args: { notification: { ...base, id: 'n-4', type: 'OVERDUE_1DAY', is_read: true, message: '읽은 알림(흐리게 표시)입니다.' } },
};
