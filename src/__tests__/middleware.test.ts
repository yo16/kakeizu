/**
 * src/middleware.ts のテスト
 *
 * @supabase/ssr の createServerClient をモックして、
 * Edge Runtime なしで middleware のルーティングロジックを検証する。
 * @jest-environment node
 */

// auth.getUser のモック関数（テストごとに挙動を変更）
const mockGetUser = jest.fn();
const mockSupabaseInstance = {
  auth: { getUser: mockGetUser },
};

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => mockSupabaseInstance),
}));

import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '../middleware';

/**
 * テスト用 NextRequest を生成するヘルパー
 */
function createMockRequest(pathname: string, baseUrl = 'https://example.com'): NextRequest {
  return new NextRequest(`${baseUrl}${pathname}`);
}

/**
 * getUser 成功（認証済み）のデフォルトモック設定
 */
function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-123', email: 'test@example.com' } },
    error: null,
  });
}

/**
 * getUser 失敗（未認証: user = null）のモック設定
 */
function mockUnauthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: null,
  });
}

/**
 * getUser エラー（リフレッシュトークン失効等）のモック設定
 */
function mockAuthError(message = 'JWT expired') {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message, status: 401 },
  });
}

describe('src/middleware.ts', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -------------------------------------------------------------------------
  // 保護ルート + 認証済み（正常系）
  // -------------------------------------------------------------------------
  describe('保護ルートへの認証済みアクセス', () => {
    it('/dashboard への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/dashboard');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/trees への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/trees');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/trees/abc への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/trees/abc');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/account への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/account');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/account/settings への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/account/settings');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/onboarding への認証済みアクセスは NextResponse.next() を返すこと', async () => {
      mockAuthenticatedUser();
      const req = createMockRequest('/onboarding');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 非保護ルート（正常系: スルー）
  // -------------------------------------------------------------------------
  describe('非保護ルートへのアクセス', () => {
    it('/login への未認証アクセスはリダイレクトせずスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/login');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/signup への未認証アクセスはスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/signup');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/share/xyz への未認証アクセスはスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/share/xyz');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/share/abc への未認証アクセスはスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/share/abc');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/auth/callback へのアクセスはスルーすること', async () => {
      // matcer の除外設定によりこのパスは middleware 対象外だが、
      // isProtectedPath の観点でもスルーされることを確認する
      mockUnauthenticatedUser();
      const req = createMockRequest('/auth/callback');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/api/stripe/webhook へのアクセスはスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/api/stripe/webhook');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('/ (ルート) へのアクセスはスルーすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('非保護ルートへのアクセスでは getUser が呼ばれること（セッション更新）', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/login');
      await middleware(req);
      // セッション更新のために getUser は呼ばれる
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 保護ルート + 未認証（異常系: リダイレクト）
  // -------------------------------------------------------------------------
  describe('保護ルートへの未認証アクセス', () => {
    it('/dashboard への未認証アクセスは /login にリダイレクトすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/dashboard');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('/trees への未認証アクセスは /login にリダイレクトすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/trees');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('/trees/abc への未認証アクセスは /login にリダイレクトすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/trees/abc');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('/account への未認証アクセスは /login にリダイレクトすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/account');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('/onboarding への未認証アクセスは /login にリダイレクトすること', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/onboarding');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('リダイレクト先 URL に reason パラメータが含まれないこと（未認証の場合）', async () => {
      mockUnauthenticatedUser();
      const req = createMockRequest('/dashboard');
      const res = await middleware(req);
      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('reason');
    });
  });

  // -------------------------------------------------------------------------
  // 保護ルート + 認証エラー（異常系: session_expired リダイレクト）
  // -------------------------------------------------------------------------
  describe('保護ルートへのセッションリフレッシュ失敗', () => {
    it('/dashboard アクセス時に authError がある場合 /login?reason=session_expired にリダイレクトすること', async () => {
      mockAuthError('JWT expired');
      const req = createMockRequest('/dashboard');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/login');
      expect(location).toContain('reason=session_expired');
    });

    it('/trees アクセス時に authError がある場合 /login?reason=session_expired にリダイレクトすること', async () => {
      mockAuthError('refresh_token_not_found');
      const req = createMockRequest('/trees');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('reason=session_expired');
    });

    it('セッションエラー時のリダイレクト URL が正しい形式であること', async () => {
      mockAuthError();
      const req = createMockRequest('/account');
      const res = await middleware(req);
      const location = res.headers.get('location') ?? '';
      const url = new URL(location);
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('reason')).toBe('session_expired');
    });

    it('authError がある場合は未認証とは異なるリダイレクト（reason パラメータあり）になること', async () => {
      // 未認証（user=null, error=null）は /login のみ
      mockUnauthenticatedUser();
      const reqUnauth = createMockRequest('/dashboard');
      const resUnauth = await middleware(reqUnauth);
      const locationUnauth = resUnauth.headers.get('location') ?? '';

      // authError あり → /login?reason=session_expired
      mockAuthError();
      const reqError = createMockRequest('/dashboard');
      const resError = await middleware(reqError);
      const locationError = resError.headers.get('location') ?? '';

      expect(locationUnauth).not.toContain('reason');
      expect(locationError).toContain('reason=session_expired');
    });
  });

  // -------------------------------------------------------------------------
  // パス判定（保護対象 vs 非保護対象）
  // -------------------------------------------------------------------------
  describe('保護対象パスの判定', () => {
    const protectedPaths = [
      '/dashboard',
      '/trees',
      '/trees/abc',
      '/trees/123/edit',
      '/account',
      '/account/settings',
      '/account/billing',
      '/onboarding',
      '/onboarding/step1',
    ];

    it.each(protectedPaths)(
      '%s は保護対象であり未認証時にリダイレクトされること',
      async (path) => {
        mockUnauthenticatedUser();
        const req = createMockRequest(path);
        const res = await middleware(req);
        expect(res.status).toBe(307);
      }
    );

    const publicPaths = [
      '/login',
      '/signup',
      '/share/abc',
      '/auth/callback',
      '/api/stripe/webhook',
      '/',
    ];

    it.each(publicPaths)(
      '%s は保護対象外であり未認証時もスルーされること',
      async (path) => {
        mockUnauthenticatedUser();
        const req = createMockRequest(path);
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }
    );
  });
});
