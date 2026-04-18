/**
 * signOut Server Action のユニットテスト
 *
 * Supabase クライアントと next/navigation をモックして、
 * サインアウト成功・失敗時のリダイレクト動作を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// next/navigation の redirect をモック（NEXT_REDIRECT をスロー）
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${path}` });
  }),
}));

// Supabase クライアントをモック
const mockSignOut = jest.fn();

const mockSupabaseClient = {
  auth: {
    signOut: mockSignOut,
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { redirect } from 'next/navigation';
import { signOut } from '../actions/sign-out';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('signOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 正常系
  // -----------------------------------------------------------------------
  describe('サインアウト成功', () => {
    it('成功時に /login にリダイレクトすること', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('signOut が呼ばれること', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // エラー時も /login にリダイレクト
  // -----------------------------------------------------------------------
  describe('Supabase エラー時', () => {
    it('signOut がエラーを返した場合も /login にリダイレクトすること', async () => {
      mockSignOut.mockResolvedValue({ error: { message: 'Session not found' } });

      await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('エラー時でも signOut が一度呼ばれること', async () => {
      mockSignOut.mockResolvedValue({ error: { message: 'Session not found' } });

      await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});
