/** EmptyState 통합 테스트 (RTL). */
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from './EmptyState';

test('보조 문구 + CTA 렌더, CTA 클릭 시 onAddTask 호출', () => {
  const onAddTask = jest.fn();
  render(<EmptyState onAddTask={onAddTask} />);
  expect(screen.getByText('오늘의 작업이 없습니다')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /새 작업 추가하기/ }));
  expect(onAddTask).toHaveBeenCalledTimes(1);
});
