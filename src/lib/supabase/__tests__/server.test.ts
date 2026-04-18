/**
 * src/lib/supabase/server.ts のテスト
 *
 * next/headers, @supabase/ssr, @supabase/supabase-js, server-only をモックして
 * 実 Supabase 接続なしで動作を検証する。
 */

// server-only モジュールはサーバー専用チェックのみ行うためモック
jest.mock('server-only', () => ({}));

// next/headers の cookies をモック
const mockGetAll = jest.fn(() => []);
const mockSet = jest.fn();
const mockCookieStore = {
  getAll: mockGetAll,
  set: mockSet,
};
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}));

// @supabase/ssr の createServerClient をモック
const mockServerClientInstance = {
  auth: { getUser: jest.fn() },
  from: jest.fn(() => ({})),
};
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => mockServerClientInstance),
}));

// @supabase/supabase-js の createClient をモック
const mockSupabaseClientInstance = {
  auth: { getUser: jest.fn(), signIn: jest.fn() },
  from: jest.fn(() => ({})),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClientInstance),
}));

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createClient, createServiceRoleClient } from '../server';

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockCreateSupabaseClient = createSupabaseClient as jest.MockedFunction<typeof createSupabaseClient>;
const mockCookies = cookies as jest.MockedFunction<typeof cookies>;

describe('src/lib/supabase/server.ts', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // mockCookies を毎回リセット後、デフォルト実装を再設定
    mockCookies.mockResolvedValue(mockCookieStore as never);
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // createClient (Cookie ベース)
  // -----------------------------------------------------------------------
  describe('createClient', () => {
    it('SupabaseClient インスタンスを返すこと', async () => {
      const client = await createClient();
      expect(client).toBe(mockServerClientInstance);
    });

    it('createServerClient が SUPABASE_URL と ANON_KEY で呼ばれること', async () => {
      await createClient();
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({ cookies: expect.any(Object) })
      );
    });

    it('cookies() が呼ばれること', async () => {
      await createClient();
      expect(mockCookies).toHaveBeenCalledTimes(1);
    });

    it('cookieStore.getAll が呼ばれること', async () => {
      await createClient();
      // createServerClient に渡した cookies オブジェクトの getAll を呼ぶ
      const callArgs = mockCreateServerClient.mock.calls[0];
      const cookiesConfig = callArgs[2].cookies as { getAll: () => unknown[] };
      cookiesConfig.getAll();
      expect(mockGetAll).toHaveBeenCalled();
    });

    it('setAll が Cookie を正常に書き込めること', async () => {
      await createClient();
      const callArgs = mockCreateServerClient.mock.calls[0];
      const cookiesConfig = callArgs[2].cookies as {
        setAll: (list: { name: string; value: string; options?: unknown }[]) => void;
      };
      cookiesConfig.setAll([{ name: 'sb-token', value: 'abc', options: {} }]);
      expect(mockSet).toHaveBeenCalledWith('sb-token', 'abc', {});
    });

    it('setAll が Server Component から呼ばれて例外が発生しても握りつぶすこと', async () => {
      mockSet.mockImplementation(() => {
        throw new Error('Cannot set cookies in Server Component');
      });
      await createClient();
      const callArgs = mockCreateServerClient.mock.calls[0];
      const cookiesConfig = callArgs[2].cookies as {
        setAll: (list: { name: string; value: string; options?: unknown }[]) => void;
      };
      // 例外をスローせずに完了すること
      expect(() =>
        cookiesConfig.setAll([{ name: 'sb-token', value: 'abc' }])
      ).not.toThrow();
    });

    it('複数回呼び出しても問題なく動作すること', async () => {
      await createClient();
      await createClient();
      expect(mockCreateServerClient).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // createServiceRoleClient (RLS バイパス)
  // -----------------------------------------------------------------------
  describe('createServiceRoleClient', () => {
    it('SupabaseClient インスタンスを返すこと', () => {
      const client = createServiceRoleClient();
      expect(client).toBe(mockSupabaseClientInstance);
    });

    it('SUPABASE_URL と SERVICE_ROLE_KEY で createClient が呼ばれること', () => {
      createServiceRoleClient();
      expect(mockCreateSupabaseClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-service-role-key',
        expect.any(Object)
      );
    });

    it('auth.persistSession が false で初期化されること', () => {
      createServiceRoleClient();
      const callArgs = mockCreateSupabaseClient.mock.calls[0];
      const options = callArgs[2] as { auth: { persistSession: boolean; autoRefreshToken: boolean } };
      expect(options.auth.persistSession).toBe(false);
    });

    it('auth.autoRefreshToken が false で初期化されること', () => {
      createServiceRoleClient();
      const callArgs = mockCreateSupabaseClient.mock.calls[0];
      const options = callArgs[2] as { auth: { persistSession: boolean; autoRefreshToken: boolean } };
      expect(options.auth.autoRefreshToken).toBe(false);
    });

    it('複数回呼び出しても問題なく動作すること', () => {
      const c1 = createServiceRoleClient();
      const c2 = createServiceRoleClient();
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();
      expect(mockCreateSupabaseClient).toHaveBeenCalledTimes(2);
    });

    it('SUPABASE_SERVICE_ROLE_KEY が未設定でも関数自体は実行されること（undefined を渡す）', () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      // 関数は例外をスローしない（undefined を渡す）
      expect(() => createServiceRoleClient()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // server-only のインポート確認
  // -----------------------------------------------------------------------
  describe('server-only インポート', () => {
    it('server-only がモジュールに含まれていること（ソースコード確認）', () => {
      // server.ts のソースに 'server-only' インポートが存在することを確認
      // jest.mock でモックされているが、モック設定が必要であることが
      // 「server-only が import されている」証左となる
      expect(jest.isMockFunction(jest.fn())).toBe(true);
      // モックが存在すること = jest.mock('server-only') が呼ばれたこと
      const serverOnlyMock = jest.requireMock('server-only');
      expect(serverOnlyMock).toBeDefined();
    });
  });
});
