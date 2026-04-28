/**
 * @jest-environment node
 */

/**
 * src/features/auth/actions/delete-account.ts のテスト
 *
 * テスト方針:
 * - Supabase クライアント / Stripe SDK / next/navigation をすべてモックして
 *   deleteAccount Server Action のフロー制御ロジックのみを検証する。
 * - Arrange-Act-Assert パターンに従い、各テストは独立して実行可能。
 */

// server-only モジュールを空オブジェクトとしてモック
jest.mock('server-only', () => ({}));

// next/navigation の redirect をモック
// Next.js の redirect() は内部で NEXT_REDIRECT エラーを throw する挙動を模倣する
const mockRedirect = jest.fn((url: string) => {
  const error = new Error('NEXT_REDIRECT');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (error as any).digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
});
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// logger をモック
const mockLoggerError = jest.fn();
const mockLoggerInfo = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: {
    log: jest.fn(),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    debug: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// Stripe SDK をモック
const mockSubscriptionsCancel = jest.fn();
const mockStripeInstance = {
  subscriptions: {
    cancel: mockSubscriptionsCancel,
  },
};
const mockGetStripe = jest.fn(() => mockStripeInstance);
jest.mock('@/lib/stripe/server', () => ({
  getStripe: () => mockGetStripe(),
}));

// Supabase クライアントをモック
const mockGetUser = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));
const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

const mockDeleteUser = jest.fn();
const mockAdminClient = {
  auth: {
    admin: {
      deleteUser: mockDeleteUser,
    },
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
  createServiceRoleClient: jest.fn(() => mockAdminClient),
}));

import { deleteAccount } from '@/features/auth/actions/delete-account';

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_EMAIL = 'user@example.com';
const TEST_USER_ID = 'user-uuid-001';
const TEST_STRIPE_SUB_ID = 'sub_test_abc123';

const mockUser = {
  id: TEST_USER_ID,
  email: TEST_EMAIL,
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ---------------------------------------------------------------------------
// テスト前後のリセット
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // デフォルト: 認証済みユーザー
  mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

  // デフォルト: deleteUser 成功
  mockDeleteUser.mockResolvedValue({ error: null });

  // デフォルト: Stripe cancel 成功
  mockSubscriptionsCancel.mockResolvedValue({ id: TEST_STRIPE_SUB_ID, status: 'canceled' });
});

// ---------------------------------------------------------------------------
// バリデーションエラー (既存ケース保護)
// ---------------------------------------------------------------------------

describe('バリデーションエラー', () => {
  it('input が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
    // Arrange
    const input = {};

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });

  it('confirmEmail が不正な形式の場合 VALIDATION_ERROR を返すこと', async () => {
    // Arrange
    const input = { confirmEmail: 'not-an-email' };

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        field: 'confirmEmail',
      }),
    });
  });

  it('confirmEmail がセッションのメールアドレスと一致しない場合 VALIDATION_ERROR を返すこと', async () => {
    // Arrange
    const input = { confirmEmail: 'other@example.com' };

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        field: 'confirmEmail',
        message: 'メールアドレスが一致しません',
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// セッションなし (既存ケース保護)
// ---------------------------------------------------------------------------

describe('UNAUTHENTICATED', () => {
  it('セッションがない場合 UNAUTHENTICATED を返すこと', async () => {
    // Arrange
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    });
  });

  it('getUser がエラーを返す場合 UNAUTHENTICATED を返すこと', async () => {
    // Arrange
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired', status: 401 },
    });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    });
  });
});

// ---------------------------------------------------------------------------
// auth.admin.deleteUser エラー (既存ケース保護)
// ---------------------------------------------------------------------------

describe('INTERNAL_ERROR', () => {
  it('deleteUser がエラーを返す場合 INTERNAL_ERROR を返すこと', async () => {
    // Arrange
    mockMaybySingleNoSubscription();
    mockDeleteUser.mockResolvedValue({ error: { message: 'User not found', status: 404 } });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    const result = await deleteAccount(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    });
  });
});

// ---------------------------------------------------------------------------
// 正常系: Stripe Subscription ありかつ active
// ---------------------------------------------------------------------------

describe('正常系: Stripe Subscription がある場合のキャンセル', () => {
  it('status が active のとき stripe.subscriptions.cancel が呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith(TEST_STRIPE_SUB_ID, {
      invoice_now: false,
      prorate: false,
    });
  });

  it('status が active のとき cancel 後に auth.admin.deleteUser が呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('status が active のとき /login へリダイレクトされること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act & Assert (redirect が呼ばれることを確認)
    await expectRedirectToLogin(() => deleteAccount(input));
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// 正常系: Stripe Subscription ありかつ past_due
// ---------------------------------------------------------------------------

describe('正常系: Stripe Subscription が past_due の場合のキャンセル', () => {
  it('status が past_due のとき stripe.subscriptions.cancel が呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'past_due' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith(TEST_STRIPE_SUB_ID, {
      invoice_now: false,
      prorate: false,
    });
  });

  it('status が past_due のとき deleteUser も呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'past_due' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// 正常系: Subscription レコードなし
// ---------------------------------------------------------------------------

describe('正常系: Subscription レコードなし', () => {
  it('subscription が null のとき cancel は呼ばれないこと', async () => {
    // Arrange
    mockMaybySingleNoSubscription();
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it('subscription が null のとき deleteUser は呼ばれること', async () => {
    // Arrange
    mockMaybySingleNoSubscription();
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('subscription が null のとき /login へリダイレクトされること', async () => {
    // Arrange
    mockMaybySingleNoSubscription();
    const input = { confirmEmail: TEST_EMAIL };

    // Act & Assert
    await expectRedirectToLogin(() => deleteAccount(input));
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// 正常系: stripe_subscription_id が null
// ---------------------------------------------------------------------------

describe('正常系: stripe_subscription_id が null', () => {
  it('stripe_subscription_id が null のとき cancel は呼ばれないこと', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: null, status: 'incomplete' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it('stripe_subscription_id が null のとき deleteUser は呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: null, status: 'incomplete' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// 正常系: status が canceled
// ---------------------------------------------------------------------------

describe('正常系: status が canceled', () => {
  it('status が canceled のとき cancel は呼ばれないこと', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'canceled' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it('status が canceled のとき deleteUser は呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'canceled' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// 異常系: Stripe API がエラーを throw
// ---------------------------------------------------------------------------

describe('異常系: Stripe API がエラーを throw', () => {
  it('stripe.subscriptions.cancel が throw してもエラーログが出力されること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    const stripeError = new Error('Stripe API timeout');
    mockSubscriptionsCancel.mockRejectedValue(stripeError);
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('[deleteAccount] Stripe subscription cancel failed'),
      stripeError
    );
  });

  it('stripe.subscriptions.cancel が throw しても deleteUser が呼ばれること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    mockSubscriptionsCancel.mockRejectedValue(new Error('Stripe network error'));
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('stripe.subscriptions.cancel が throw しても /login へリダイレクトされること', async () => {
    // Arrange
    mockMaybySingle({ stripe_subscription_id: TEST_STRIPE_SUB_ID, status: 'active' });
    mockSubscriptionsCancel.mockRejectedValue(new Error('Stripe error'));
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// 異常系: Subscription fetch エラー
// ---------------------------------------------------------------------------

describe('異常系: Subscription fetch エラー', () => {
  it('subscription fetch がエラーを返すときエラーログが出力されること', async () => {
    // Arrange
    mockMaybySingleError({ message: 'DB connection failed', code: '500' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('[deleteAccount] subscription fetch error:'),
      'DB connection failed'
    );
  });

  it('subscription fetch がエラーを返しても cancel は呼ばれないこと', async () => {
    // Arrange
    mockMaybySingleError({ message: 'DB error', code: '500' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it('subscription fetch がエラーを返しても deleteUser は呼ばれること', async () => {
    // Arrange
    mockMaybySingleError({ message: 'DB error', code: '500' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act
    await expectRedirectToLogin(() => deleteAccount(input));

    // Assert
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('subscription fetch がエラーを返しても /login へリダイレクトされること', async () => {
    // Arrange
    mockMaybySingleError({ message: 'DB error', code: '500' });
    const input = { confirmEmail: TEST_EMAIL };

    // Act & Assert
    await expectRedirectToLogin(() => deleteAccount(input));
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// テストヘルパー関数
// ---------------------------------------------------------------------------

/**
 * maybeSingle が subscription なし (data: null) を返すようにセットアップ
 */
function mockMaybySingleNoSubscription() {
  mockMaybySingle(null);
}

/**
 * maybeSingle が指定データを返すようにセットアップ
 */
function mockMaybySingle(data: { stripe_subscription_id: string | null; status: string } | null) {
  mockMaybeSingle.mockResolvedValue({ data, error: null });
}

/**
 * maybeSingle がエラーを返すようにセットアップ
 */
function mockMaybySingleError(error: { message: string; code: string }) {
  mockMaybeSingle.mockResolvedValue({ data: null, error });
}

/**
 * deleteAccount を実行し、NEXT_REDIRECT を catch してアサーションを続行できるようにする。
 * Next.js の redirect() は throw するため、テスト内では catch が必要。
 */
async function expectRedirectToLogin(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = error as any;
    if (e?.message === 'NEXT_REDIRECT') {
      return; // 正常: redirect が呼ばれた
    }
    throw error; // 予期せぬエラーは再スロー
  }
}
