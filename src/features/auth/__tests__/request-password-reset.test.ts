/**
 * requestPasswordReset Server Action のユニットテスト
 *
 * Supabase クライアントをモックして、
 * バリデーション・成功・エラー時の動作（セキュリティ上の統一レスポンス）を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// Supabase クライアントをモック
const mockResetPasswordForEmail = jest.fn();

const mockSupabaseClient = {
  auth: {
    resetPasswordForEmail: mockResetPasswordForEmail,
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { requestPasswordReset } from '../actions/request-password-reset';

describe('requestPasswordReset', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // バリデーションエラー
  // -----------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('email が未入力の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await requestPasswordReset({ email: '' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('email の形式が不正の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await requestPasswordReset({ email: 'not-an-email' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'email',
        }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await requestPasswordReset({});
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await requestPasswordReset({ email: 'bad' });
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 正常系（メール送信成功）
  // -----------------------------------------------------------------------
  describe('メール送信成功', () => {
    it('成功時に ok: true とメッセージを返すこと', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      const result = await requestPasswordReset({ email: 'user@example.com' });
      expect(result).toEqual({
        ok: true,
        data: { message: expect.stringContaining('パスワードリセット') },
      });
    });

    it('NEXT_PUBLIC_SITE_URL が設定されている場合 redirectTo にその URL を使うこと', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      await requestPasswordReset({ email: 'user@example.com' });
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        { redirectTo: 'https://example.com/auth/callback' }
      );
    });

    it('NEXT_PUBLIC_SITE_URL が未設定の場合 localhost をデフォルトとして使うこと', async () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      await requestPasswordReset({ email: 'user@example.com' });
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        { redirectTo: 'http://localhost:3000/auth/callback' }
      );
    });
  });

  // -----------------------------------------------------------------------
  // セキュリティ: エラー時も同一レスポンスを返す（列挙攻撃防止）
  // -----------------------------------------------------------------------
  describe('Supabase エラー時（セキュリティ上の統一レスポンス）', () => {
    it('Supabase がエラーを返しても ok: true を返すこと（列挙攻撃防止）', async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        error: { message: 'User not found' },
      });

      const result = await requestPasswordReset({ email: 'notfound@example.com' });
      expect(result).toEqual({
        ok: true,
        data: { message: expect.any(String) },
      });
    });

    it('エラー時のメッセージが成功時と同一であること', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });
      const successResult = await requestPasswordReset({ email: 'user@example.com' });

      mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Error' } });
      const errorResult = await requestPasswordReset({ email: 'other@example.com' });

      expect(successResult.ok && successResult.data.message).toBe(
        errorResult.ok && errorResult.data.message
      );
    });
  });
});
