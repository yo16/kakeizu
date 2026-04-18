/**
 * src/lib/supabase/client.ts のテスト
 *
 * createBrowserClient をモックし、実 Supabase 接続なしで動作を検証する。
 */

// createBrowserClient をモック
const mockBrowserClientInstance = {
  auth: { getUser: jest.fn(), signIn: jest.fn(), signOut: jest.fn() },
  from: jest.fn(() => ({})),
  storage: { from: jest.fn() },
};

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => mockBrowserClientInstance),
}));

import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '../client';

const mockCreateBrowserClient = createBrowserClient as jest.MockedFunction<typeof createBrowserClient>;

describe('src/lib/supabase/client.ts', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('createClient', () => {
    it('SupabaseClient インスタンスを返すこと', () => {
      const client = createClient();
      expect(client).toBe(mockBrowserClientInstance);
    });

    it('createBrowserClient が SUPABASE_URL と ANON_KEY で呼ばれること', () => {
      createClient();
      expect(mockCreateBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      );
    });

    it('戻り値に auth プロパティが存在すること', () => {
      const client = createClient();
      expect(client).toHaveProperty('auth');
    });

    it('戻り値に from プロパティが存在すること', () => {
      const client = createClient();
      expect(client).toHaveProperty('from');
    });

    it('戻り値に storage プロパティが存在すること', () => {
      const client = createClient();
      expect(client).toHaveProperty('storage');
    });

    it('複数回呼び出しても問題なく動作すること', () => {
      const client1 = createClient();
      const client2 = createClient();
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(mockCreateBrowserClient).toHaveBeenCalledTimes(2);
    });

    it('createBrowserClient が正確に1回呼ばれること（単一呼び出し）', () => {
      createClient();
      expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    });
  });
});
