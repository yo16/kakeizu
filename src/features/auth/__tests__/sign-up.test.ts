/**
 * signUpWithPassword Server Action のユニットテスト
 *
 * Supabase クライアントをモックして、
 * バリデーション・サインアップ成功・失敗ケースを検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// Supabase クライアントをモック
const mockSignUp = jest.fn();

const mockSupabaseClient = {
  auth: {
    signUp: mockSignUp,
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { signUpWithPassword } from '../actions/sign-up';

describe('signUpWithPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // バリデーションエラー
  // -----------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('email が未入力の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signUpWithPassword({ email: '', password: 'password123' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('email の形式が不正の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signUpWithPassword({ email: 'invalid-email', password: 'password123' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'email',
        }),
      });
    });

    it('password が 8 文字未満の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signUpWithPassword({ email: 'user@example.com', password: '1234567' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'password',
        }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await signUpWithPassword({});
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await signUpWithPassword({ email: 'bad', password: 'x' });
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // サインアップ成功
  // -----------------------------------------------------------------------
  describe('サインアップ成功', () => {
    const validInput = { email: 'newuser@example.com', password: 'password123' };

    it('成功時に ok: true とメッセージを返すこと', async () => {
      mockSignUp.mockResolvedValue({ error: null });

      const result = await signUpWithPassword(validInput);
      expect(result).toEqual({
        ok: true,
        data: { message: expect.stringContaining('確認メール') },
      });
    });

    it('signUp が正しい email と password で呼ばれること', async () => {
      mockSignUp.mockResolvedValue({ error: null });

      await signUpWithPassword({ email: 'test@example.com', password: 'mypassword1' });
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'mypassword1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Supabase エラー
  // -----------------------------------------------------------------------
  describe('Supabase エラー', () => {
    it('メールアドレス重複エラーの場合 VALIDATION_ERROR を返すこと', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'User already registered' },
      });

      const result = await signUpWithPassword({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'email',
        }),
      });
    });

    it('メールアドレス重複エラー（小文字）の場合 VALIDATION_ERROR を返すこと', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'user already registered' },
      });

      const result = await signUpWithPassword({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('その他の Supabase エラーの場合 INTERNAL_ERROR を返すこと', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'Database connection failed' },
      });

      const result = await signUpWithPassword({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -----------------------------------------------------------------------
  // 境界値テスト
  // -----------------------------------------------------------------------
  describe('境界値', () => {
    it('password が ちょうど 8 文字の場合は成功すること', async () => {
      mockSignUp.mockResolvedValue({ error: null });

      const result = await signUpWithPassword({
        email: 'user@example.com',
        password: '12345678',
      });

      expect(result).toEqual({
        ok: true,
        data: expect.any(Object),
      });
    });
  });
});
