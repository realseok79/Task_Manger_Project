/** TaskCreationModal 최우선 과제 토글/차단 통합 테스트 (RTL). */
import { render, screen } from '@testing-library/react';
import TaskCreationModal from './TaskCreationModal';

const base = { isOpen: true, onClose: jest.fn(), onSubmit: jest.fn(), onClearServerError: jest.fn(), serverError: null };

test('hasPriorityTask=true → 토글 비활성 + 경고 배너 표시', () => {
  render(<TaskCreationModal {...base} hasPriorityTask />);
  expect(screen.getByText('최우선 과제가 이미 존재합니다!!')).toBeInTheDocument();
  expect(screen.getByText(/완료하거나 해제한 후/)).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: '최우선 과제로 설정' })).toBeDisabled();
});

test('hasPriorityTask=false → 토글 정상(비활성 아님), 배너 없음', () => {
  render(<TaskCreationModal {...base} hasPriorityTask={false} />);
  expect(screen.queryByText('최우선 과제가 이미 존재합니다!!')).toBeNull();
  expect(screen.getByRole('switch', { name: '최우선 과제로 설정' })).not.toBeDisabled();
});
