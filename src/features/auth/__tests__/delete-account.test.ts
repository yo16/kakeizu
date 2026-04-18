/**
 * deleteAccount Server Action のユニットテスト
 *
 * Supabase クライアント（通常 + Service Role）と next/navigation をモックして、
 * バリデーション・メール一致確認・アカウント削除・リダイレクトを検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// next/navigation の redirect をモック（NEXT_REDIRECT をスロー）
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${path}` });
  }),
}));

// 通常クライアント（Cookie ベース）のモック
const mockGetUser = jest.fn();
const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
  },
};

// Service Role クライアントのモック
const mockDeleteUser = jest.fn();
const mockAdminClient = {
  auth: {
    admin: {
      deleteUser: mockDeleteUser,
    },
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
  createServiceRoleClient: jest.fn(() => mockAdminClient),
}));

import { redirect } from 'next/navigation';
import { deleteAccount } from '../actions/delete-account';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // バリデーションエラー
  // -----------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('confirmEmail が未入力の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteAccount({ confirmEmail: '' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('confirmEmail の形式が不正の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteAccount({ confirmEmail: 'invalid-email' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'confirmEmail',
        }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteAccount({});
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await deleteAccount({ confirmEmail: 'bad' });
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 認証エラー（セッション無効）
  // -----------------------------------------------------------------------
  describe('セッション認証エラー', () => {
    it('getUser がエラーを返す場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Session expired' },
      });

      const result = await deleteAccount({ confirmEmail: 'user@example.com' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('getUser が user: null を返す場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await deleteAccount({ confirmEmail: 'user@example.com' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('認証エラー時に deleteUser が呼ばれないこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      });

      await deleteAccount({ confirmEmail: 'user@example.com' });
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // メールアドレス不一致
  // -----------------------------------------------------------------------
  describe('confirmEmail 不一致', () => {
    it('確認メールが実際のメールと異なる場合 VALIDATION_ERROR を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'actual@example.com' } },
        error: null,
      });

      const result = await deleteAccount({ confirmEmail: 'wrong@example.com' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          field: 'confirmEmail',
        }),
      });
    });

    it('メール不一致時に deleteUser が呼ばれないこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'actual@example.com' } },
        error: null,
      });

      await deleteAccount({ confirmEmail: 'wrong@example.com' });
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // アカウント削除成功
  // -----------------------------------------------------------------------
  describe('アカウント削除成功', () => {
    const setupAuthenticatedUser = () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });
    };

    it('削除成功時に /login にリダイレクトすること', async () => {
      setupAuthenticatedUser();
      mockDeleteUser.mockResolvedValue({ error: null });

      await expect(
        deleteAccount({ confirmEmail: 'user@example.com' })
      ).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('deleteUser が正しいユーザー ID で呼ばれること', async () => {
      setupAuthenticatedUser();
      mockDeleteUser.mockResolvedValue({ error: null });

      await expect(
        deleteAccount({ confirmEmail: 'user@example.com' })
      ).rejects.toThrow('NEXT_REDIRECT');

      expect(mockDeleteUser).toHaveBeenCalledWith('user-123');
    });
  });

  // -----------------------------------------------------------------------
  // Service Role deleteUser エラー
  // -----------------------------------------------------------------------
  describe('deleteUser エラー（INTERNAL_ERROR）', () => {
    it('deleteUser がエラーを返す場合 INTERNAL_ERROR を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });
      mockDeleteUser.mockResolvedValue({
        error: { message: 'User not found' },
      });

      const result = await deleteAccount({ confirmEmail: 'user@example.com' });
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('deleteUser エラー時に redirect が呼ばれないこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });
      mockDeleteUser.mockResolvedValue({
        error: { message: 'Database error' },
      });

      await deleteAccount({ confirmEmail: 'user@example.com' });
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
