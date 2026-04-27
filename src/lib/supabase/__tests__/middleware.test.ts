/**
 * src/lib/supabase/middleware.ts のテスト
 *
 * @supabase/ssr, next/server をモックして実 Supabase 接続・Edge Runtime
 * なしで updateSession の動作を検証する。
 * @jest-environment node
 */

// auth.getUser のモック関数
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: null }, error: null });
const mockAuthInstance = { getUser: mockGetUser };

// createServerClient のモック
const mockSupabaseInstance = {
  auth: mockAuthInstance,
};
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => mockSupabaseInstance),
}));

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '../middleware';

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;

/**
 * テスト用 NextRequest を生成するヘルパー
 */
function createMockRequest(
  url = 'https://example.com/',
  cookies: Record<string, string> = {}
): NextRequest {
  const req = new NextRequest(url);
  Object.entries(cookies).forEach(([name, value]) => {
    req.cookies.set(name, value);
  });
  return req;
}

describe('src/lib/supabase/middleware.ts', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // 基本動作
  // -----------------------------------------------------------------------
  describe('updateSession', () => {
    it('NextResponse を返すこと', async () => {
      const req = createMockRequest();
      const res = await updateSession(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it('createServerClient が SUPABASE_URL と PUBLISHABLE_KEY で呼ばれること', async () => {
      const req = createMockRequest();
      await updateSession(req);
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({ cookies: expect.any(Object) })
      );
    });

    it('auth.getUser が呼ばれること（セッションリフレッシュ）', async () => {
      const req = createMockRequest();
      await updateSession(req);
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });

    it('レスポンスが NextResponse.next() で生成されること', async () => {
      const req = createMockRequest();
      const res = await updateSession(req);
      // NextResponse インスタンスであり status が 200
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Cookie の読み取り
  // -----------------------------------------------------------------------
  describe('Cookie の処理', () => {
    it('リクエストの Cookie を読み取る getAll が呼べること', async () => {
      const req = createMockRequest('https://example.com/', {
        'sb-token': 'test-jwt',
      });
      await updateSession(req);

      const callArgs = mockCreateServerClient.mock.calls[0];
      const cookiesConfig = callArgs[2].cookies as { getAll: () => { name: string; value: string }[] };
      const allCookies = cookiesConfig.getAll();
      // リクエストに設定した Cookie が取得できること
      expect(Array.isArray(allCookies)).toBe(true);
      const found = allCookies.find((c) => c.name === 'sb-token');
      expect(found?.value).toBe('test-jwt');
    });

    it('setAll を呼ぶとリクエストとレスポンスの Cookie が更新されること', async () => {
      const req = createMockRequest();
      await updateSession(req);

      const callArgs = mockCreateServerClient.mock.calls[0];
      const cookiesConfig = callArgs[2].cookies as {
        setAll: (list: { name: string; value: string; options?: unknown }[]) => void;
      };
      cookiesConfig.setAll([{ name: 'sb-token', value: 'new-jwt', options: { path: '/' } }]);

      // リクエスト Cookie に反映されること
      expect(req.cookies.get('sb-token')?.value).toBe('new-jwt');
    });

    it('空の Cookie でも正常に動作すること', async () => {
      const req = createMockRequest('https://example.com/');
      const res = await updateSession(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it('複数の Cookie が設定されているリクエストでも動作すること', async () => {
      const req = createMockRequest('https://example.com/', {
        'sb-access-token': 'access',
        'sb-refresh-token': 'refresh',
      });
      const res = await updateSession(req);
      expect(res).toBeInstanceOf(NextResponse);
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // auth.getUser の結果パターン
  // -----------------------------------------------------------------------
  describe('auth.getUser の結果パターン', () => {
    it('getUser がユーザー情報を返す場合も NextResponse を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
      const req = createMockRequest();
      const res = await updateSession(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it('getUser がエラーを返す場合も NextResponse を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired', status: 401 },
      });
      const req = createMockRequest();
      const res = await updateSession(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it('getUser が reject する場合は例外が伝播すること', async () => {
      mockGetUser.mockRejectedValue(new Error('Network error'));
      const req = createMockRequest();
      await expect(updateSession(req)).rejects.toThrow('Network error');
    });
  });

  // -----------------------------------------------------------------------
  // 複数回呼び出し
  // -----------------------------------------------------------------------
  describe('複数回呼び出し', () => {
    it('複数回呼び出しても問題なく動作すること', async () => {
      const req1 = createMockRequest('https://example.com/page1');
      const req2 = createMockRequest('https://example.com/page2');
      const res1 = await updateSession(req1);
      const res2 = await updateSession(req2);
      expect(res1).toBeInstanceOf(NextResponse);
      expect(res2).toBeInstanceOf(NextResponse);
      expect(mockGetUser).toHaveBeenCalledTimes(2);
    });
  });
});
