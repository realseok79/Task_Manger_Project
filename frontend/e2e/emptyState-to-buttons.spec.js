/**
 * Playwright E2E — Empty State → 작업 생성 → 버튼 전환 플로우 (EC-04,05,18,19,20,23,24,10).
 * 러너: npm i -D @playwright/test && npx playwright install  (현재 미설치 → 산출물)
 * 실행 전제: 빈 사용자 상태가 필요(EC-01). mock 은 기본 시드 Task 가 있으므로
 *   ① 빈 시드 fixture 로 dev:mock 기동하거나, ② 실서버에 빈 테스트 사용자 토큰을 주입한다.
 *
 * 실행 예:  BASE_URL=http://localhost:5173 npx playwright test e2e/emptyState-to-buttons.spec.js
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Empty State → 작업 생성 → 상태 전환', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('EC-01/04/05: 빈 화면 CTA → 모달 → 생성 → TaskList', async ({ page }) => {
    // EC-01: Empty State 표시 (빈 사용자 전제)
    const cta = page.getByRole('button', { name: /새 작업 추가하기/ });
    await expect(cta).toBeVisible();

    // EC-04: CTA → 모달 열림
    await cta.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 입력: 제목 + 소요시간(1시간)
    await dialog.getByPlaceholder('무엇을 할까요?').fill('E2E 작업');
    await dialog.getByLabel('시간').fill('1');
    await dialog.getByRole('button', { name: '작업 생성' }).click();

    // EC-05: Empty State 사라지고 카드 표시
    await expect(page.getByRole('button', { name: /새 작업 추가하기/ })).toHaveCount(0);
    const card = page.getByText('E2E 작업');
    await expect(card).toBeVisible();
  });

  test('EC-18/19/20/23/24: 버튼 노출 + 낙관적 전환', async ({ page }) => {
    const card = page.locator('.task-card', { hasText: 'E2E 작업' });
    await expect(card).toBeVisible();

    // EC-18: IDLE → [시작하기]
    await expect(card.getByText('시작하기')).toBeVisible();
    await expect(card.getByText('끝내기')).toHaveCount(0);

    // EC-23: 시작 → 즉시 [중지][끝내기]
    await card.getByText('시작하기').click();
    await expect(card.getByText('중지')).toBeVisible();
    await expect(card.getByText('끝내기')).toBeVisible();

    // EC-24: 중지 → 즉시 [이어서 시작하기][끝내기]
    await card.getByText('중지').click();
    await expect(card.getByText('이어서 시작하기')).toBeVisible();
    await expect(card.getByText('끝내기')).toBeVisible();
  });

  test('EC-10: 최우선 과제 존재 시 토글 비활성 + 차단 배너', async ({ page }) => {
    // 1) 최우선 과제 1건 생성
    await page.getByRole('button', { name: /새 작업 추가하기/ }).first().click().catch(() => {});
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('무엇을 할까요?').fill('최우선 작업');
    await dialog.getByLabel('시간').fill('1');
    await dialog.getByRole('switch', { name: '최우선 과제로 설정' }).click();
    await dialog.getByRole('button', { name: '작업 생성' }).click();

    // 2) 다시 모달 열기 → 토글 disabled + 배너 노출
    await page.getByRole('button', { name: /작업 추가|새 작업/ }).first().click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2.getByRole('switch', { name: '최우선 과제로 설정' })).toBeDisabled();
    await expect(dialog2.getByText('최우선 과제가 이미 존재합니다!!')).toBeVisible();
    // EC-17: 제목이 텍스트로 렌더(스크립트 실행 없음) — XSS 회귀 가드
    await expect(dialog2.locator('script')).toHaveCount(0);
  });
});
