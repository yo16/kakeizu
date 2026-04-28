/**
 * BillingPageClient コンポーネントのテスト (dc6: OverLimitBanner グローバル化後)
 *
 * dc6 タスクにより BillingPageClient から OverLimitBanner と overages prop が削除された。
 * このテストでは以下を検証する:
 * - OverLimitBanner がレンダリングされないこと (props を持たないため)
 * - CurrentPlanCard と PlanComparisonTable が引き続きレンダリングされること
 */

// CSS Modules をモック
jest.mock('../page.module.css', () => ({
  container: 'container',
  heading: 'heading',
}));

// CurrentPlanCard をモック
jest.mock('@/features/billing/components/CurrentPlanCard', () => ({
  CurrentPlanCard: jest.fn(() => <div data-testid="mock-current-plan-card" />),
}));

// PlanComparisonTable をモック
jest.mock('@/features/billing/components/PlanComparisonTable', () => ({
  PlanComparisonTable: jest.fn(() => <div data-testid="mock-plan-comparison-table" />),
}));

// OverLimitBanner をモック (呼び出しがないことを検証するため)
jest.mock('@/features/billing/components/OverLimitBanner', () => ({
  OverLimitBanner: jest.fn(() => <div data-testid="mock-over-limit-banner" />),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import { BillingPageClient } from '../BillingPageClient';
import { CurrentPlanCard } from '@/features/billing/components/CurrentPlanCard';
import { PlanComparisonTable } from '@/features/billing/components/PlanComparisonTable';
import { OverLimitBanner } from '@/features/billing/components/OverLimitBanner';

const MockCurrentPlanCard = CurrentPlanCard as jest.MockedFunction<typeof CurrentPlanCard>;
const MockPlanComparisonTable = PlanComparisonTable as jest.MockedFunction<typeof PlanComparisonTable>;
const MockOverLimitBanner = OverLimitBanner as jest.MockedFunction<typeof OverLimitBanner>;

/** テスト用プラン情報 */
const mockCurrentPlan = {
  planName: 'Free',
  planId: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

/** テスト用プラン一覧 */
const mockPlans = [
  {
    id: 'free',
    name: 'Free',
    monthly_price_jpy: 0,
    max_trees: 1,
    max_persons_per_tree: 50,
    max_photos_per_person: 5,
    stripe_price_id: null,
    is_active: true,
  },
];

describe('BillingPageClient (dc6: OverLimitBanner グローバル化後)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // OverLimitBanner 非表示の検証
  // -------------------------------------------------------------------------
  describe('OverLimitBanner の非表示', () => {
    it('OverLimitBanner がレンダリングされないこと', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(screen.queryByTestId('mock-over-limit-banner')).not.toBeInTheDocument();
    });

    it('OverLimitBanner コンポーネントが呼び出されないこと', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(MockOverLimitBanner).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // CurrentPlanCard のレンダリング検証
  // -------------------------------------------------------------------------
  describe('CurrentPlanCard のレンダリング', () => {
    it('CurrentPlanCard がレンダリングされること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(screen.getByTestId('mock-current-plan-card')).toBeInTheDocument();
    });

    it('CurrentPlanCard が1回呼ばれること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(MockCurrentPlanCard).toHaveBeenCalledTimes(1);
    });

    it('CurrentPlanCard に currentPlan の各プロパティが渡されること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(MockCurrentPlanCard).toHaveBeenCalledWith(
        expect.objectContaining({
          planName: 'Free',
          planId: 'free',
          status: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          stripeCustomerId: null,
        }),
        undefined
      );
    });
  });

  // -------------------------------------------------------------------------
  // PlanComparisonTable のレンダリング検証
  // -------------------------------------------------------------------------
  describe('PlanComparisonTable のレンダリング', () => {
    it('PlanComparisonTable がレンダリングされること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(screen.getByTestId('mock-plan-comparison-table')).toBeInTheDocument();
    });

    it('PlanComparisonTable が1回呼ばれること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(MockPlanComparisonTable).toHaveBeenCalledTimes(1);
    });

    it('PlanComparisonTable に plans と currentPlanId が渡されること', () => {
      render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

      expect(MockPlanComparisonTable).toHaveBeenCalledWith(
        expect.objectContaining({
          plans: mockPlans,
          currentPlanId: 'free',
        }),
        undefined
      );
    });
  });

  // -------------------------------------------------------------------------
  // 見出しのレンダリング検証
  // -------------------------------------------------------------------------
  it('ページ見出し「プランと請求」が表示されること', () => {
    render(<BillingPageClient currentPlan={mockCurrentPlan} plans={mockPlans} />);

    expect(screen.getByRole('heading', { name: 'プランと請求' })).toBeInTheDocument();
  });
});
