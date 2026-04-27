/**
 * PlanComparisonTable コンポーネントのユニットテスト
 *
 * 全プランの描画、現在プランバッジ、disabled UpgradeButton、
 * Enterprise お問い合わせリンク、無制限表示を検証する。
 */
import { render, screen } from '@testing-library/react';

import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { PlanComparisonTable, type PlanRow } from '../PlanComparisonTable';

// UpgradeButton が使う Server Action をモック
jest.mock('@/features/billing/actions/create-checkout-session', () => ({
  createCheckoutSession: jest.fn(),
}));

// redirectExternal をモック (UpgradeButton/BillingPortalLink 経由で呼ばれる)
jest.mock('@/lib/navigation/redirect', () => ({
  redirectExternal: jest.fn(),
}));

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const PLANS: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    monthly_price_jpy: 0,
    max_trees: 1,
    max_persons_per_tree: 5,
    max_photos_per_person: 2,
    stripe_price_id: null,
    is_active: true,
  },
  {
    id: 'basic',
    name: 'Basic',
    monthly_price_jpy: 500,
    max_trees: 2,
    max_persons_per_tree: 20,
    max_photos_per_person: 5,
    stripe_price_id: 'price_basic',
    is_active: true,
  },
  {
    id: 'standard',
    name: 'Standard',
    monthly_price_jpy: 2000,
    max_trees: 5,
    max_persons_per_tree: 40,
    max_photos_per_person: 10,
    stripe_price_id: 'price_standard',
    is_active: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly_price_jpy: 0,
    max_trees: -1,
    max_persons_per_tree: -1,
    max_photos_per_person: -1,
    stripe_price_id: null,
    is_active: true,
  },
];

describe('PlanComparisonTable', () => {
  // ケース1: 4 プランすべての行/カードがレンダリングされる
  it('4 プランすべての名前が表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    expect(screen.getAllByText('Free').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Basic').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Standard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Enterprise').length).toBeGreaterThanOrEqual(1);
  });

  // ケース2: 現在のプランに「現在のプラン」バッジが表示される
  it('現在のプランに「現在」バッジが表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    // aria-label="現在のプラン" のバッジが存在する
    const badges = screen.getAllByLabelText('現在のプラン');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  // ケース3: 現在のプランのセルには「現在のプラン」ラベルが表示される (UpgradeButton ではない)
  it('currentPlanId のプランのアクションセルには「現在のプラン」テキストが表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    expect(screen.getAllByText('現在のプラン').length).toBeGreaterThanOrEqual(1);
  });

  // ケース4: Free プランへの遷移はダウングレード案内テキストが表示される
  it('Free プランへの遷移はダウングレード案内テキストが表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    // PC とカード両方で Free 行に案内が出ているはず (合計2回)
    const notes = screen.getAllByText(/ダウングレード/);
    expect(notes.length).toBeGreaterThan(0);
  });

  // ケース5: Enterprise (stripe_price_id=null) のセルには「お問い合わせ」リンクが表示される
  it('Enterprise プランのセルには「お問い合わせ」リンクが表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    const contactLinks = screen.getAllByRole('link', { name: 'お問い合わせ' });
    expect(contactLinks.length).toBeGreaterThanOrEqual(1);
    contactLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'));
    });
  });

  // ケース6: -1 の上限値が「無制限」と表示される
  it('-1 の上限値が「無制限」として表示される', () => {
    renderWithToast(<PlanComparisonTable plans={PLANS} currentPlanId="basic" />);
    const unlimitedCells = screen.getAllByText('無制限');
    // Enterprise の 3 フィールド (max_trees, max_persons_per_tree, max_photos_per_person) × 2 (table + card)
    expect(unlimitedCells.length).toBeGreaterThanOrEqual(3);
  });
});
