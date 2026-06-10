/** TaskActionButtons 통합 테스트 (React Testing Library). 러너: npm i -D vitest @testing-library/react jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import TaskActionButtons from './TaskActionButtons';

const handlers = () => ({ onStart: jest.fn(), onPause: jest.fn(), onResume: jest.fn(), onFinish: jest.fn() });

test('COMPLETED → 아무 버튼도 렌더하지 않는다', () => {
  const { container } = render(<TaskActionButtons status="COMPLETED" {...handlers()} />);
  expect(container.querySelector('.task-actions')).toBeNull();
});

test('ACTIVE → [중지][끝내기]', () => {
  const h = handlers();
  render(<TaskActionButtons status="ACTIVE" {...h} />);
  fireEvent.click(screen.getByText('중지'));
  fireEvent.click(screen.getByText('끝내기'));
  expect(h.onPause).toHaveBeenCalled();
  expect(h.onFinish).toHaveBeenCalled();
  expect(screen.queryByText('시작하기')).toBeNull();
});

test('PAUSED/OVERDUE → [이어서 시작하기][끝내기]', () => {
  for (const status of ['PAUSED', 'OVERDUE']) {
    const h = handlers();
    const { unmount } = render(<TaskActionButtons status={status} {...h} />);
    fireEvent.click(screen.getByText('이어서 시작하기'));
    expect(h.onResume).toHaveBeenCalled();
    expect(screen.getByText('끝내기')).toBeInTheDocument();
    unmount();
  }
});

test('IDLE → [시작하기]만', () => {
  const h = handlers();
  render(<TaskActionButtons status="IDLE" {...h} />);
  fireEvent.click(screen.getByText('시작하기'));
  expect(h.onStart).toHaveBeenCalled();
  expect(screen.queryByText('끝내기')).toBeNull();
});
