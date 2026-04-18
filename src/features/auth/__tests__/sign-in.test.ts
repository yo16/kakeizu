/**
 * signInWithPassword Server Action のユニットテスト
 *
 * Supabase クライアントと next/navigation をモックして、
 * バリデーション・認証成功・認証失敗・リダイレクトロジックを検証する。
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
const mockSignInWithPassword = jest.fn();
const mockGetUser = jest.fn();
const mockMaybySingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybySingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    getUser: mockGetUser,
  },
  from: mockFrom,
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { redirect } from 'next/navigation';
import { signInWithPassword } from '../actions/sign-in';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('signInWithPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // バリデーションエラー
  // -----------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('email が未入力の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signInWithPassword({ email: '', password: 'password123' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('email の形式が不正の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signInWithPassword({ email: 'not-an-email', password: 'password123' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'email',
        }),
      });
    });

    it('password が 8 文字未満の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signInWithPassword({ email: 'user@example.com', password: 'short' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'password',
        }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signInWithPassword({});
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が null の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signInWithPassword(null);
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await signInWithPassword({ email: 'bad', password: 'x' });
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Supabase エラー
  // -----------------------------------------------------------------------
  describe('Supabase 認証エラー', () => {
    it('signInWithPassword がエラーを返す場合 UNAUTHENTICATED を返すこと', async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });

      const result = await signInWithPassword({
        email: 'user@example.com',
        password: 'wrongpassword',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('Supabase エラー時に redirect が呼ばれないこと', async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });

      await signInWithPassword({ email: 'user@example.com', password: 'wrongpassword' });
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 認証成功 → リダイレクト
  // -----------------------------------------------------------------------
  describe('認証成功後のリダイレクト', () => {
    const validInput = { email: 'user@example.com', password: 'password123' };

    it('onboarding 未完了の場合 /onboarding にリダイレクトすること', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
      mockMaybySingle.mockResolvedValue({
        data: { is_completed: false },
      });

      await expect(signInWithPassword(validInput)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
    });

    it('onboarding_state が null の場合 /onboarding にリダイレクトすること', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
      mockMaybySingle.mockResolvedValue({ data: null });

      await expect(signInWithPassword(validInput)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
    });

    it('onboarding 完了済みの場合 /dashboard にリダイレクトすること', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
      mockMaybySingle.mockResolvedValue({
        data: { is_completed: true },
      });

      await expect(signInWithPassword(validInput)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('getUser が null を返す場合 /dashboard にリダイレクトすること', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await expect(signInWithPassword(validInput)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('signInWithPassword が正しい email と password で呼ばれること', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await expect(
        signInWithPassword({ email: 'test@example.com', password: 'mypassword1' })
      ).rejects.toThrow('NEXT_REDIRECT');

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'mypassword1',
      });
    });
  });
});
