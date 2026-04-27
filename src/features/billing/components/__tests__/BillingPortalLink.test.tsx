/**
 * BillingPortalLink コンポーネントのユニットテスト
 *
 * ボタン表示、クリック時の Server Action 呼び出し、
 * 成功時リダイレクト・失敗時 Toast 表示、loading 状態を検証する。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { BillingPortalLink } from '../BillingPortalLink';

// Server Action をモック
jest.mock('@/features/billing/actions/create-portal-session', () => ({
  createPortalSession: jest.fn(),
}));
import { createPortalSession } from '@/features/billing/actions/create-portal-session';
const mockCreatePortalSession = createPortalSession as jest.MockedFunction<typeof createPortalSession>;

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

describe('BillingPortalLink', () => {
  // ケース1: 「支払い・解約を管理」ボタンが表示される
  it('「支払い・解約を管理」ボタンが表示される', () => {
    renderWithToast(<BillingPortalLink />);
    expect(screen.getByRole('button', { name: '支払い・解約を管理' })).toBeInTheDocument();
  });

  // ケース2: クリックで createPortalSession が呼ばれる
  it('ボタンをクリックすると createPortalSession が呼ばれる', async () => {
    mockCreatePortalSession.mockResolvedValueOnce({
      ok: true,
      data: { url: 'https://billing.stripe.com/portal/test' },
    });
    renderWithToast(<BillingPortalLink />);
    await userEvent.click(screen.getByRole('button', { name: '支払い・解約を管理' }));
    await waitFor(() => {
      expect(mockCreatePortalSession).toHaveBeenCalledTimes(1);
    });
  });

  // ケース3: ok: true 時に window.location.assign(url) が呼ばれる
  it('createPortalSession が ok: true を返したとき window.location.assign が呼ばれる', async () => {
    const portalUrl = 'https://billing.stripe.com/portal/test';
    mockCreatePortalSession.mockResolvedValueOnce({
      ok: true,
      data: { url: portalUrl },
    });
    renderWithToast(<BillingPortalLink />);
    await userEvent.click(screen.getByRole('button', { name: '支払い・解約を管理' }));
    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith(portalUrl);
    });
  });

  // ケース4: ok: false 時に Toast エラーが表示される
  it('createPortalSession が ok: false を返したとき Toast エラーが表示される', async () => {
    const errorMessage = 'Customer Portal セッションの作成に失敗しました';
    mockCreatePortalSession.mockResolvedValueOnce({
      ok: false,
      error: { code: 'STRIPE_ERROR', message: errorMessage },
    });
    renderWithToast(<BillingPortalLink />);
    await userEvent.click(screen.getByRole('button', { name: '支払い・解約を管理' }));
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  // ケース5: クリック後 loading 状態になる (aria-disabled)
  it('クリック直後に aria-disabled が true になる', async () => {
    // 非同期処理を保留することで loading 状態を観察する
    let resolveAction!: (value: Awaited<ReturnType<typeof createPortalSession>>) => void;
    mockCreatePortalSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );
    renderWithToast(<BillingPortalLink />);
    const button = screen.getByRole('button', { name: '支払い・解約を管理' });
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
