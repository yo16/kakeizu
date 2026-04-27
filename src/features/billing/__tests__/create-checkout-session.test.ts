/**
 * createCheckoutSession Server Action のユニットテスト
 *
 * 認証・バリデーション・Stripe初期化エラー・Customer作成・
 * Checkout Session作成・origin取得・正常系を検証する。
 * 外部依存はすべてモック化し、実 Stripe API は呼ばない。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// next/headers をモック
jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceRoleClient: jest.fn(),
}));

// Stripe SDK をモック
jest.mock('@/lib/stripe/server', () => ({
  getStripe: jest.fn(),
}));

// ulid をモック
jest.mock('ulid', () => ({
  ulid: jest.fn().mockReturnValue('01XXXXXXXXXXXXXXXXXXXXXXXX'),
}));

import { headers } from 'next/headers';
import { createCheckoutSession } from '../actions/create-checkout-session';
import { getServerSession } from '@/lib/auth/session';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';

const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateServiceRoleClient = createServiceRoleClient as jest.MockedFunction<typeof createServiceRoleClient>;
const mockGetStripe = getStripe as jest.MockedFunction<typeof getStripe>;

// テスト用定数
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PRICE_ID = 'price_test_123456';
const CUSTOMER_ID = 'cus_test_123456';
const SESSION_URL = 'https://checkout.stripe.com/pay/cs_test_123456';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** 認証済みセッションを設定するヘルパー */
function setupAuthenticatedSession({ email }: { email?: string } = {}) {
  mockGetServerSession.mockResolvedValue({
    user: {
      id: USER_ID,
      email: email ?? 'test@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2024-01-01T00:00:00Z',
    },
    session: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Supabase Cookie クライアントの SELECT モックを設定するヘルパー */
function buildSupabaseSelectMock(
  subscriptionRow: { stripe_customer_id: string | null } | null | 'error'
) {
  let maybeSingleResult: { data: unknown; error: unknown };
  if (subscriptionRow === 'error') {
    maybeSingleResult = { data: null, error: { code: '42000', message: 'DB error' } };
  } else {
    maybeSingleResult = { data: subscriptionRow, error: null };
  }

  const maybeSingleFn = jest.fn().mockResolvedValue(maybeSingleResult);
  const eqFn = jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const selectChain = { eq: eqFn };
  const fromFn = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: fromFn } as any);

  return { fromFn, eqFn, maybeSingleFn };
}

/** Supabase Service Role クライアントの upsert モックを設定するヘルパー */
function buildSupabaseUpsertMock(upsertError: unknown | null) {
  const upsertFn = jest.fn().mockResolvedValue({ error: upsertError });
  const fromFn = jest.fn().mockReturnValue({ upsert: upsertFn });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateServiceRoleClient.mockReturnValue({ from: fromFn } as any);

  return { fromFn, upsertFn };
}

/** Stripe モックを設定するヘルパー */
function buildStripeMock({
  customerCreate = jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
  sessionCreate = jest.fn().mockResolvedValue({ url: SESSION_URL }),
}: {
  customerCreate?: jest.Mock;
  sessionCreate?: jest.Mock;
} = {}) {
  mockGetStripe.mockReturnValue({
    customers: { create: customerCreate },
    checkout: { sessions: { create: sessionCreate } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as ReturnType<typeof getStripe>);

  return { customerCreate, sessionCreate };
}

/** headers() モックを設定するヘルパー */
function buildHeadersMock({
  host = 'example.com',
  proto = 'https',
}: {
  host?: string | null;
  proto?: string | null;
} = {}) {
  const getMock = jest.fn((key: string) => {
    if (key === 'host') return host;
    if (key === 'x-forwarded-proto') return proto;
    return null;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHeaders.mockResolvedValue({ get: getMock } as any);
  return { getMock };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // デフォルトのヘッダーモックを設定
    buildHeadersMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 認証チェック
  // -------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未認証時に Stripe を呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(mockGetStripe).not.toHaveBeenCalled();
    });

    it('未認証時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // バリデーション
  // -------------------------------------------------------------------------
  describe('バリデーション', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('priceId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createCheckoutSession({ priceId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('priceId が undefined の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createCheckoutSession({ priceId: undefined });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createCheckoutSession({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーション失敗時に Supabase を呼ばないこと', async () => {
      await createCheckoutSession({ priceId: '' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('バリデーション失敗時に Stripe を呼ばないこと', async () => {
      await createCheckoutSession({ priceId: '' });

      expect(mockGetStripe).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Stripe 初期化エラー
  // -------------------------------------------------------------------------
  describe('Stripe 初期化エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('getStripe() が throw した場合 INTERNAL_ERROR を返すこと', async () => {
      mockGetStripe.mockImplementation(() => {
        throw new Error('STRIPE_SECRET_KEY が設定されていません');
      });

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('Stripe 初期化エラー時に Supabase の subscription SELECT を呼ばないこと', async () => {
      mockGetStripe.mockImplementation(() => {
        throw new Error('STRIPE_SECRET_KEY が設定されていません');
      });

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // subscription 取得エラー
  // -------------------------------------------------------------------------
  describe('subscription 取得エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildStripeMock();
    });

    it('SELECT エラー時 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseSelectMock('error');

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('SELECT エラー時に Stripe customers.create を呼ばないこと', async () => {
      const { customerCreate } = buildStripeMock();
      buildSupabaseSelectMock('error');

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(customerCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 既存 Customer (stripe_customer_id 既存)
  // -------------------------------------------------------------------------
  describe('既存 Customer', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
      buildSupabaseUpsertMock(null);
    });

    it('subscription に stripe_customer_id がある場合は customers.create を呼ばないこと', async () => {
      const { customerCreate, sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(customerCreate).not.toHaveBeenCalled();
      expect(sessionCreate).toHaveBeenCalled();
    });

    it('既存 customer ID で checkout.sessions.create が呼ばれること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: CUSTOMER_ID }),
        expect.anything()
      );
    });

    it('既存 customer ID 時に Service Role クライアントの upsert を呼ばないこと', async () => {
      buildStripeMock();
      const { upsertFn } = buildSupabaseUpsertMock(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(upsertFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 新規 Customer (stripe_customer_id なし)
  // -------------------------------------------------------------------------
  describe('新規 Customer', () => {
    beforeEach(() => {
      setupAuthenticatedSession({ email: 'newuser@example.com' });
    });

    it('subscription が null の場合に customers.create が呼ばれること', async () => {
      buildSupabaseSelectMock(null);
      buildSupabaseUpsertMock(null);
      const { customerCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(customerCreate).toHaveBeenCalled();
    });

    it('customers.create に渡る metadata.user_id が正しいこと', async () => {
      buildSupabaseSelectMock(null);
      buildSupabaseUpsertMock(null);
      const { customerCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(customerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { user_id: USER_ID } })
      );
    });

    it('session.user.email がある場合 customers.create に email が渡ること', async () => {
      setupAuthenticatedSession({ email: 'user@example.com' });
      buildSupabaseSelectMock(null);
      buildSupabaseUpsertMock(null);
      const { customerCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(customerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' })
      );
    });

    it('session.user.email がない場合 customers.create に email が渡らないこと', async () => {
      mockGetServerSession.mockResolvedValue({
        user: {
          id: USER_ID,
          email: undefined,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2024-01-01T00:00:00Z',
        },
        session: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      buildSupabaseSelectMock(null);
      buildSupabaseUpsertMock(null);
      const { customerCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      const callArg = customerCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('email');
    });

    it('customers.create 後に Service Role クライアントの upsert が呼ばれること', async () => {
      buildSupabaseSelectMock(null);
      buildStripeMock();
      const { upsertFn } = buildSupabaseUpsertMock(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(upsertFn).toHaveBeenCalled();
    });

    it('upsert が { user_id, stripe_customer_id, plan_id: "free", status: "active" } で呼ばれること', async () => {
      buildSupabaseSelectMock(null);
      buildStripeMock();
      const { upsertFn } = buildSupabaseUpsertMock(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(upsertFn).toHaveBeenCalledWith(
        {
          user_id: USER_ID,
          stripe_customer_id: CUSTOMER_ID,
          plan_id: 'free',
          status: 'active',
        },
        expect.anything()
      );
    });

    it('upsert の onConflict が "user_id" であること', async () => {
      buildSupabaseSelectMock(null);
      buildStripeMock();
      const { upsertFn } = buildSupabaseUpsertMock(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(upsertFn).toHaveBeenCalledWith(
        expect.anything(),
        { onConflict: 'user_id' }
      );
    });

    it('customers.create で例外が throw された場合 STRIPE_ERROR を返すこと', async () => {
      buildSupabaseSelectMock(null);
      const { customerCreate } = buildStripeMock();
      customerCreate.mockRejectedValue(new Error('Stripe API error'));

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'STRIPE_ERROR' }),
      });
    });

    it('Stripe Customer 作成失敗時に upsert を呼ばないこと', async () => {
      buildSupabaseSelectMock(null);
      const { customerCreate } = buildStripeMock();
      customerCreate.mockRejectedValue(new Error('Stripe API error'));
      const { upsertFn } = buildSupabaseUpsertMock(null);

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(upsertFn).not.toHaveBeenCalled();
    });

    it('Stripe Customer 作成失敗時に checkout.sessions.create を呼ばないこと', async () => {
      buildSupabaseSelectMock(null);
      const { customerCreate, sessionCreate } = buildStripeMock();
      customerCreate.mockRejectedValue(new Error('Stripe API error'));

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('upsert で error が返った場合 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseSelectMock(null);
      buildStripeMock();
      buildSupabaseUpsertMock({ code: '42000', message: 'upsert error' });

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('upsert 失敗時に checkout.sessions.create を呼ばないこと', async () => {
      buildSupabaseSelectMock(null);
      const { sessionCreate } = buildStripeMock();
      buildSupabaseUpsertMock({ code: '42000', message: 'upsert error' });

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // checkout.sessions.create
  // -------------------------------------------------------------------------
  describe('checkout.sessions.create', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
    });

    it('mode: "subscription" で呼ばれること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'subscription' }),
        expect.anything()
      );
    });

    it('line_items: [{ price: priceId, quantity: 1 }] で呼ばれること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: PRICE_ID, quantity: 1 }],
        }),
        expect.anything()
      );
    });

    it('customer: stripeCustomerId で呼ばれること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: CUSTOMER_ID }),
        expect.anything()
      );
    });

    it('client_reference_id: userId で呼ばれること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_reference_id: USER_ID }),
        expect.anything()
      );
    });

    it('subscription_data.metadata.user_id が正しいこと', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: { metadata: { user_id: USER_ID } },
        }),
        expect.anything()
      );
    });

    it('success_url が {origin}/account/billing?status=success の形であること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://example.com/account/billing?status=success',
        }),
        expect.anything()
      );
    });

    it('cancel_url が {origin}/pricing?status=canceled の形であること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://example.com/pricing?status=canceled',
        }),
        expect.anything()
      );
    });

    it('第二引数の idempotencyKey が文字列で渡ること', async () => {
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    it('checkout.sessions.create が throw した場合 STRIPE_ERROR を返すこと', async () => {
      const { sessionCreate } = buildStripeMock();
      sessionCreate.mockRejectedValue(new Error('Checkout API error'));

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'STRIPE_ERROR' }),
      });
    });

    it('session.url が null の場合 STRIPE_ERROR を返すこと', async () => {
      const { sessionCreate } = buildStripeMock();
      sessionCreate.mockResolvedValue({ url: null });

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'STRIPE_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // origin 取得
  // -------------------------------------------------------------------------
  describe('origin 取得', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
    });

    it('headers() の host と x-forwarded-proto から URL が組み立てられること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://example.com/account/billing?status=success',
        }),
        expect.anything()
      );
    });

    it('x-forwarded-proto がない場合 NODE_ENV=production なら https を使うこと', async () => {
      const restoreSpy = jest.replaceProperty(process.env, 'NODE_ENV', 'production');

      buildHeadersMock({ host: 'example.com', proto: null });
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: expect.stringContaining('https://'),
        }),
        expect.anything()
      );

      restoreSpy.restore();
    });

    it('host が取れなかった場合 NEXT_PUBLIC_SITE_URL をフォールバックとして使用すること', async () => {
      buildHeadersMock({ host: null, proto: null });
      process.env.NEXT_PUBLIC_SITE_URL = 'https://kakeizu.example.com';
      const { sessionCreate } = buildStripeMock();

      await createCheckoutSession({ priceId: PRICE_ID });

      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://kakeizu.example.com/account/billing?status=success',
        }),
        expect.anything()
      );

      delete process.env.NEXT_PUBLIC_SITE_URL;
    });
  });

  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildHeadersMock({ host: 'example.com', proto: 'https' });
    });

    it('すべてうまくいった場合 { ok: true, data: { url: "..." } } を返すこと', async () => {
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
      buildStripeMock({
        sessionCreate: jest.fn().mockResolvedValue({ url: SESSION_URL }),
      });

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: true,
        data: { url: SESSION_URL },
      });
    });

    it('新規 Customer でもすべてうまくいった場合 { ok: true, data: { url: "..." } } を返すこと', async () => {
      setupAuthenticatedSession({ email: 'newuser@example.com' });
      buildSupabaseSelectMock(null);
      buildSupabaseUpsertMock(null);
      buildStripeMock({
        customerCreate: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
        sessionCreate: jest.fn().mockResolvedValue({ url: SESSION_URL }),
      });

      const result = await createCheckoutSession({ priceId: PRICE_ID });

      expect(result).toEqual({
        ok: true,
        data: { url: SESSION_URL },
      });
    });
  });
});
