/**
 * @jest-environment node
 *
 * OAuth コールバック Route Handler のユニットテスト
 *
 * Supabase クライアントをモックして、
 * コード欠如・exchangeCodeForSession エラー・onboarding 状態に基づく
 * リダイレクトロジックを検証する。
 *
 * Route Handler は Edge Runtime / Node.js の Web API を使用するため
 * testEnvironment を node に設定する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// Supabase クライアントのモック
const mockExchangeCodeForSession = jest.fn();
const mockGetUser = jest.fn();
const mockMaybySingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybySingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

const mockSupabaseClient = {
  auth: {
    exchangeCodeForSession: mockExchangeCodeForSession,
    getUser: mockGetUser,
  },
  from: mockFrom,
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

/**
 * テスト用 NextRequest を生成するヘルパー
 */
function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // code パラメータなし
  // -----------------------------------------------------------------------
  describe('code パラメータなし', () => {
    it('code がない場合 /login?error=auth_callback_failed にリダイレクトすること', async () => {
      const req = makeRequest('https://example.com/auth/callback');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://example.com/login?error=auth_callback_failed'
      );
    });

    it('code が空文字の場合も /login?error=auth_callback_failed にリダイレクトすること', async () => {
      const req = makeRequest('https://example.com/auth/callback?code=');
      const response = await GET(req);

      // code='' は falsy なのでリダイレクト
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://example.com/login?error=auth_callback_failed'
      );
    });

    it('code なしの場合に exchangeCodeForSession が呼ばれないこと', async () => {
      const req = makeRequest('https://example.com/auth/callback');
      await GET(req);
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // exchangeCodeForSession エラー
  // -----------------------------------------------------------------------
  describe('exchangeCodeForSession エラー', () => {
    it('エラー時に /login?error=auth_callback_failed にリダイレクトすること', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: { message: 'Invalid code' },
      });

      const req = makeRequest('https://example.com/auth/callback?code=invalid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://example.com/login?error=auth_callback_failed'
      );
    });

    it('exchangeCodeForSession が正しいコードで呼ばれること', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      mockMaybySingle.mockResolvedValue({ data: { is_completed: true } });

      const req = makeRequest('https://example.com/auth/callback?code=my-auth-code');
      await GET(req);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('my-auth-code');
    });
  });

  // -----------------------------------------------------------------------
  // getUser エラー
  // -----------------------------------------------------------------------
  describe('getUser エラー', () => {
    it('getUser がエラーを返す場合 /login?error=auth_callback_failed にリダイレクトすること', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://example.com/login?error=auth_callback_failed'
      );
    });

    it('getUser が null ユーザーを返す場合 /login?error=auth_callback_failed にリダイレクトすること', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://example.com/login?error=auth_callback_failed'
      );
    });
  });

  // -----------------------------------------------------------------------
  // onboarding_state に基づくリダイレクト
  // -----------------------------------------------------------------------
  describe('成功時のリダイレクト', () => {
    beforeEach(() => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
    });

    it('onboarding_state が未作成（null）の場合 /onboarding にリダイレクトすること', async () => {
      mockMaybySingle.mockResolvedValue({ data: null });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://example.com/onboarding');
    });

    it('is_completed が false の場合 /onboarding にリダイレクトすること', async () => {
      mockMaybySingle.mockResolvedValue({ data: { is_completed: false } });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://example.com/onboarding');
    });

    it('is_completed が true の場合 /dashboard にリダイレクトすること', async () => {
      mockMaybySingle.mockResolvedValue({ data: { is_completed: true } });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://example.com/dashboard');
    });

    it('onboarding_state クエリが正しいユーザー ID で行われること', async () => {
      mockMaybySingle.mockResolvedValue({ data: { is_completed: true } });

      const req = makeRequest('https://example.com/auth/callback?code=valid-code');
      await GET(req);

      expect(mockFrom).toHaveBeenCalledWith('onboarding_state');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('リダイレクト先の origin が request URL から取得されること', async () => {
      mockMaybySingle.mockResolvedValue({ data: { is_completed: true } });

      const req = makeRequest('https://staging.myapp.io/auth/callback?code=valid-code');
      const response = await GET(req);

      expect(response.headers.get('location')).toBe('https://staging.myapp.io/dashboard');
    });
  });
});
