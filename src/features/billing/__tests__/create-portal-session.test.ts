/**
 * createPortalSession Server Action のユニットテスト
 *
 * 認証・subscription 取得・stripe_customer_id 未設定・Stripe 初期化エラー・
 * Portal Session 作成・origin 取得・正常系を検証する。
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

import { headers } from 'next/headers';
import { createPortalSession } from '../actions/create-portal-session';
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
const CUSTOMER_ID = 'cus_test_123456';
const PORTAL_URL = 'https://billing.stripe.com/session/test_123456';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** 認証済みセッションを設定するヘルパー */
function setupAuthenticatedSession() {
  mockGetServerSession.mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'test@example.com',
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
  subscriptionRow: { stripe_customer_id: string | null | undefined } | null | 'error'
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

/** Stripe billingPortal.sessions.create モックを設定するヘルパー */
function buildStripeMock({
  billingPortalCreate = jest.fn().mockResolvedValue({ url: PORTAL_URL }),
}: {
  billingPortalCreate?: jest.Mock;
} = {}) {
  mockGetStripe.mockReturnValue({
    billingPortal: { sessions: { create: billingPortalCreate } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as ReturnType<typeof getStripe>);

  return { billingPortalCreate };
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

describe('createPortalSession', () => {
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

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未認証時に Stripe を呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createPortalSession();

      expect(mockGetStripe).not.toHaveBeenCalled();
    });

    it('未認証時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createPortalSession();

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // subscription 取得エラー
  // -------------------------------------------------------------------------
  describe('subscription 取得エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('SELECT エラー時 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseSelectMock('error');

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('SELECT エラー時に Stripe を呼ばないこと', async () => {
      buildSupabaseSelectMock('error');

      await createPortalSession();

      expect(mockGetStripe).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stripe_customer_id 未設定 (Customer Portal 利用不可)
  // -------------------------------------------------------------------------
  describe('stripe_customer_id 未設定', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('subscription が null の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseSelectMock(null);

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('subscription はあるが stripe_customer_id が null の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseSelectMock({ stripe_customer_id: null });

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('subscription はあるが stripe_customer_id が undefined の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseSelectMock({ stripe_customer_id: undefined });

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('NOT_FOUND 時に Stripe billingPortal.sessions.create を呼ばないこと', async () => {
      buildSupabaseSelectMock(null);
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).not.toHaveBeenCalled();
    });

    it('NOT_FOUND 時のメッセージに「課金情報が見つかりません」を含むこと', async () => {
      buildSupabaseSelectMock(null);

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('課金情報が見つかりません'),
        }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // Stripe 初期化エラー
  // -------------------------------------------------------------------------
  describe('Stripe 初期化エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
    });

    it('getStripe() が throw した場合 INTERNAL_ERROR を返すこと', async () => {
      mockGetStripe.mockImplementation(() => {
        throw new Error('STRIPE_SECRET_KEY が設定されていません');
      });

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('Stripe 初期化エラー時に billingPortal.sessions.create を呼ばないこと', async () => {
      const mockCreate = jest.fn();
      mockGetStripe.mockImplementation(() => {
        throw new Error('STRIPE_SECRET_KEY が設定されていません');
      });

      await createPortalSession();

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Portal Session 作成
  // -------------------------------------------------------------------------
  describe('Portal Session 作成', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
    });

    it('stripe.billingPortal.sessions.create が { customer, return_url } で呼ばれること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).toHaveBeenCalledWith({
        customer: expect.any(String),
        return_url: expect.any(String),
      });
    });

    it('customer が subscription から取得した stripe_customer_id であること', async () => {
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: CUSTOMER_ID })
      );
    });

    it('return_url が {origin}/account/billing の形であること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ return_url: 'https://example.com/account/billing' })
      );
    });

    it('headers() に host があれば host ベースで return_url が組み立てられること', async () => {
      buildHeadersMock({ host: 'example.com', proto: 'https' });
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ return_url: 'https://example.com/account/billing' })
      );
    });

    it('headers() に host がない場合 NEXT_PUBLIC_SITE_URL がフォールバックされること', async () => {
      buildHeadersMock({ host: null, proto: null });
      process.env.NEXT_PUBLIC_SITE_URL = 'https://kakeizu.example.com';
      const { billingPortalCreate } = buildStripeMock();

      await createPortalSession();

      expect(billingPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ return_url: 'https://kakeizu.example.com/account/billing' })
      );

      delete process.env.NEXT_PUBLIC_SITE_URL;
    });

    it('billingPortal.sessions.create が throw した場合 STRIPE_ERROR を返すこと', async () => {
      const { billingPortalCreate } = buildStripeMock();
      billingPortalCreate.mockRejectedValue(new Error('Stripe Portal API error'));

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'STRIPE_ERROR' }),
      });
    });

    it('返り値の url が空文字の場合 STRIPE_ERROR を返すこと (フェールセーフ)', async () => {
      const { billingPortalCreate } = buildStripeMock();
      billingPortalCreate.mockResolvedValue({ url: '' });

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'STRIPE_ERROR' }),
      });
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

    it('すべて成功した場合 { ok: true, data: { url: "..." } } を返すこと', async () => {
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
      buildStripeMock({
        billingPortalCreate: jest.fn().mockResolvedValue({ url: PORTAL_URL }),
      });

      const result = await createPortalSession();

      expect(result).toEqual({
        ok: true,
        data: { url: PORTAL_URL },
      });
    });

    it('Service Role クライアントが呼ばれていないこと', async () => {
      buildSupabaseSelectMock({ stripe_customer_id: CUSTOMER_ID });
      buildStripeMock();

      await createPortalSession();

      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });
  });
});
