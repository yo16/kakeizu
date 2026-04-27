/**
 * UpgradeButton コンポーネントのユニットテスト
 *
 * ボタン表示、disabled 時の動作、クリック時の Server Action 呼び出し、
 * 成功時リダイレクト・失敗時 Toast 表示、loading 状態を検証する。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { UpgradeButton } from '../UpgradeButton';

// Server Action をモック
jest.mock('@/features/billing/actions/create-checkout-session', () => ({
  createCheckoutSession: jest.fn(),
}));
import { createCheckoutSession } from '@/features/billing/actions/create-checkout-session';
const mockCreateCheckoutSession = createCheckoutSession as jest.MockedFunction<typeof createCheckoutSession>;

// redirectExternal をモック (window.location.assign の薄いラッパ)
jest.mock('@/lib/navigation/redirect', () => ({
  redirectExternal: jest.fn(),
}));
import { redirectExternal } from '@/lib/navigation/redirect';
const mockAssign = redirectExternal as jest.MockedFunction<typeof redirectExternal>;

beforeEach(() => {
  jest.clearAllMocks();
});

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const defaultProps = {
  priceId: 'price_basic',
  planName: 'Basic',
};

describe('UpgradeButton', () => {
  // ケース1: 「このプランにする」ボタンが表示される
  it('「このプランにする」ボタンが表示される', () => {
    renderWithToast(<UpgradeButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /プランにアップグレード/ })).toBeInTheDocument();
  });

  // ケース2: disabled=true でクリックしても Server Action を呼ばない
  it('disabled=true のときクリックしても createCheckoutSession が呼ばれない', async () => {
    renderWithToast(<UpgradeButton {...defaultProps} disabled={true} />);
    const button = screen.getByRole('button', { name: /プランにアップグレード/ });
    await userEvent.click(button);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  // ケース3: クリックで createCheckoutSession({ priceId }) が呼ばれる
  it('ボタンをクリックすると createCheckoutSession が priceId を引数に呼ばれる', async () => {
    mockCreateCheckoutSession.mockResolvedValueOnce({
      ok: true,
      data: { url: 'https://checkout.stripe.com/session/test' },
    });
    renderWithToast(<UpgradeButton {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /プランにアップグレード/ }));
    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({ priceId: 'price_basic' });
    });
  });

  // ケース4: ok: true 時に window.location.assign(url) が呼ばれる
  it('createCheckoutSession が ok: true を返したとき window.location.assign が呼ばれる', async () => {
    const checkoutUrl = 'https://checkout.stripe.com/session/test';
    mockCreateCheckoutSession.mockResolvedValueOnce({
      ok: true,
      data: { url: checkoutUrl },
    });
    renderWithToast(<UpgradeButton {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /プランにアップグレード/ }));
    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith(checkoutUrl);
    });
  });

  // ケース5: ok: false 時に Toast エラーが表示される
  it('createCheckoutSession が ok: false を返したとき Toast エラーが表示される', async () => {
    const errorMessage = 'Checkout セッションの作成に失敗しました';
    mockCreateCheckoutSession.mockResolvedValueOnce({
      ok: false,
      error: { code: 'STRIPE_ERROR', message: errorMessage },
    });
    renderWithToast(<UpgradeButton {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /プランにアップグレード/ }));
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  // ケース6: クリック後 loading 状態 → 完了後解除
  it('クリック中は aria-disabled が true になり、完了後に解除される', async () => {
    let resolveAction!: (value: Awaited<ReturnType<typeof createCheckoutSession>>) => void;
    mockCreateCheckoutSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );
    renderWithToast(<UpgradeButton {...defaultProps} />);
    const button = screen.getByRole('button', { name: /プランにアップグレード/ });
    await userEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
    // 処理を完了させてクリーンアップ
    resolveAction({ ok: true, data: { url: 'https://example.com' } });
    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
});
