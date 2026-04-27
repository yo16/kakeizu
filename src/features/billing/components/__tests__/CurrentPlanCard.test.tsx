/**
 * CurrentPlanCard コンポーネントのユニットテスト
 *
 * 現在プランの表示、課金状態に応じたメッセージ切り替え、
 * BillingPortalLink の表示条件を検証する。
 */
import { render, screen } from '@testing-library/react';

import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { CurrentPlanCard } from '../CurrentPlanCard';

// BillingPortalLink が使う Server Action をモック
jest.mock('@/features/billing/actions/create-portal-session', () => ({
  createPortalSession: jest.fn(),
}));

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const baseProps = {
  planName: 'Basic',
  planId: 'basic',
  status: 'active',
  currentPeriodEnd: '2026-05-31T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  stripeCustomerId: 'cus_test123',
};

describe('CurrentPlanCard', () => {
  // ケース1: 現在のプラン名が表示される
  it('現在のプラン名が表示される', () => {
    renderWithToast(<CurrentPlanCard {...baseProps} />);
    expect(screen.getByText('Basic')).toBeInTheDocument();
  });

  // ケース2: 有料プラン (status='active', currentPeriodEnd あり) で次回課金日が表示される
  it('有料プランかつ解約予定でない場合、次回課金日が表示される', () => {
    renderWithToast(<CurrentPlanCard {...baseProps} />);
    expect(screen.getByText(/次回課金日/)).toBeInTheDocument();
  });

  // ケース3: cancelAtPeriodEnd=true で「期間終了で解約予定」のメッセージが表示される
  it('cancelAtPeriodEnd=true のとき解約予定メッセージが表示される', () => {
    renderWithToast(
      <CurrentPlanCard
        {...baseProps}
        cancelAtPeriodEnd={true}
      />
    );
    expect(screen.getByText(/解約予定/)).toBeInTheDocument();
  });

  // ケース4: status='past_due' で支払い失敗の警告が表示される
  it('status="past_due" のとき支払い失敗の警告が表示される', () => {
    renderWithToast(
      <CurrentPlanCard
        {...baseProps}
        status="past_due"
      />
    );
    expect(screen.getByText(/支払いが失敗しました/)).toBeInTheDocument();
  });

  // ケース5: stripeCustomerId が null (Free 未契約) のとき BillingPortalLink が表示されない
  it('stripeCustomerId が null のとき「支払い・解約を管理」ボタンが表示されない', () => {
    renderWithToast(
      <CurrentPlanCard
        {...baseProps}
        stripeCustomerId={null}
      />
    );
    expect(screen.queryByText('支払い・解約を管理')).toBeNull();
  });

  // ケース6: stripeCustomerId が設定済みのとき BillingPortalLink が表示される
  it('stripeCustomerId が設定済みのとき「支払い・解約を管理」ボタンが表示される', () => {
    renderWithToast(<CurrentPlanCard {...baseProps} />);
    expect(screen.getByText('支払い・解約を管理')).toBeInTheDocument();
  });

  // ケース7: Free プラン (planId='free') で次回課金日表示なし
  it('Free プランのとき次回課金日が表示されない', () => {
    renderWithToast(
      <CurrentPlanCard
        {...baseProps}
        planId="free"
        planName="Free"
        currentPeriodEnd={null}
        stripeCustomerId={null}
      />
    );
    expect(screen.queryByText(/次回課金日/)).toBeNull();
  });

  // ケース8: status='past_due' のとき alertDanger が表示され、
  //          通常状態では alertInfo (解約予定メッセージ) のみ表示
  it('status が active かつ cancelAtPeriodEnd=false のとき alertDanger も alertInfo も表示されない', () => {
    renderWithToast(
      <CurrentPlanCard
        {...baseProps}
        cancelAtPeriodEnd={false}
        status="active"
      />
    );
    expect(screen.queryByText(/支払いが失敗しました/)).toBeNull();
    expect(screen.queryByText(/解約予定/)).toBeNull();
  });
});
