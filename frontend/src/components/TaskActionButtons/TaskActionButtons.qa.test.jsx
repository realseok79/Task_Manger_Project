/**
 * QA: Task 상태별 버튼 노출 전수(EC-18~27) — React Testing Library.
 * 러너: npm i -D vitest @testing-library/react jsdom  (현재 미설치 → 산출물)
 * 순수 매트릭스는 node 로도 검증: src/lib/__tests__/qaButtonMatrix.node.mjs (22/22)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import TaskActionButtons from './TaskActionButtons';

const handlers = () => ({ onStart: jest.fn(), onPause: jest.fn(), onResume: jest.fn(), onFinish: jest.fn() });
const labels = () => [...document.querySelectorAll('.ta-btn')].map((b) => b.textContent.trim());

describe('EC-18~22 상태별 버튼 노출', () => {
  it('EC-18 IDLE → [시작하기] 1개', () => {
    render(<TaskActionButtons status="IDLE" {...handlers()} />);
    expect(screen.getByText('시작하기')).toBeInTheDocument();
    expect(document.querySelectorAll('.ta-btn')).toHaveLength(1);
  });
  it('EC-19 ACTIVE → [중지][끝내기]', () => {
    render(<TaskActionButtons status="ACTIVE" {...handlers()} />);
    expect(screen.getByText('중지')).toBeInTheDocument();
    expect(screen.getByText('끝내기')).toBeInTheDocument();
    expect(screen.queryByText('시작하기')).toBeNull();
    expect(document.querySelectorAll('.ta-btn')).toHaveLength(2);
  });
  it('EC-20 PAUSED → [이어서 시작하기][끝내기]', () => {
    render(<TaskActionButtons status="PAUSED" {...handlers()} />);
    expect(screen.getByText('이어서 시작하기')).toBeInTheDocument();
    expect(screen.getByText('끝내기')).toBeInTheDocument();
  });
  it('EC-21 OVERDUE → [이어서 시작하기][끝내기] + ▶ prefix', () => {
    render(<TaskActionButtons status="OVERDUE" {...handlers()} />);
    expect(screen.getByText('이어서 시작하기')).toBeInTheDocument(); // 라벨 텍스트 노드 보존
    expect(document.querySelector('.ta-btn__prefix')).toHaveTextContent('▶');
    expect(document.querySelector('.task-actions--overdue')).toBeInTheDocument();
  });
  it('EC-22 COMPLETED → 버튼 0개(컨테이너도 없음)', () => {
    const { container } = render(<TaskActionButtons status="COMPLETED" {...handlers()} />);
    expect(container.querySelector('.task-actions')).toBeNull();
  });
});

describe('EC-23~24 낙관적 전환(상태 변경 시 즉시 다음 세트)', () => {
  it('EC-23 IDLE→ACTIVE 리렌더 시 [중지][끝내기]', () => {
    const { rerender } = render(<TaskActionButtons status="IDLE" {...handlers()} />);
    expect(labels()).toEqual(['시작하기']);
    rerender(<TaskActionButtons status="ACTIVE" {...handlers()} />); // optimisticStatusFor(IDLE,START)=ACTIVE
    expect(labels()).toEqual(['중지', '끝내기']);
  });
  it('EC-24 ACTIVE→PAUSED 리렌더 시 [이어서 시작하기][끝내기]', () => {
    const { rerender } = render(<TaskActionButtons status="ACTIVE" {...handlers()} />);
    rerender(<TaskActionButtons status="PAUSED" {...handlers()} />);
    expect(labels()).toEqual(['이어서 시작하기', '끝내기']);
  });
});

describe('EC-25 롤백 시 이전 상태 버튼 복원', () => {
  it('ACTIVE→(낙관적)PAUSED→(실패)ACTIVE 로 복원', () => {
    const { rerender } = render(<TaskActionButtons status="ACTIVE" {...handlers()} />);
    rerender(<TaskActionButtons status="PAUSED" {...handlers()} />); // 낙관적
    expect(labels()).toEqual(['이어서 시작하기', '끝내기']);
    rerender(<TaskActionButtons status="ACTIVE" {...handlers()} />); // 실패 → 롤백
    expect(labels()).toEqual(['중지', '끝내기']);
  });
});

describe('EC-27 최우선 카드 버튼은 일반 카드와 동일', () => {
  it('동일 status 면 is_priority 와 무관하게 동일 버튼(컴포넌트가 status 만 소비)', () => {
    const { unmount } = render(<TaskActionButtons status="ACTIVE" {...handlers()} />);
    const normal = labels();
    unmount();
    render(<TaskActionButtons status="ACTIVE" {...handlers()} />); // 최우선 카드도 같은 컴포넌트/같은 status
    expect(labels()).toEqual(normal);
  });
});

describe('핸들러 호출(클릭 동작)', () => {
  it('각 버튼 클릭이 해당 핸들러를 호출하고 카드 클릭은 전파 차단', () => {
    const h = handlers();
    render(<TaskActionButtons status="ACTIVE" {...h} />);
    fireEvent.click(screen.getByText('중지'));
    fireEvent.click(screen.getByText('끝내기'));
    expect(h.onPause).toHaveBeenCalledTimes(1);
    expect(h.onFinish).toHaveBeenCalledTimes(1);
  });
});
