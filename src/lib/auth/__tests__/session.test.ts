/**
 * src/lib/auth/session.ts のテスト
 *
 * getServerSession() の正常系・異常系・例外処理を検証する。
 * @supabase/ssr と @/lib/supabase/server をモックして Supabase 接続なしで実行。
 * @jest-environment node
 */

// server-only モジュールをモック（server.ts が import しているため）
jest.mock('server-only', () => ({}));

// Supabase クライアントのモック
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
    getSession: mockGetSession,
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

import { getServerSession } from '../session';

/** テスト用ユーザーオブジェクト */
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/** テスト用セッションオブジェクト */
const mockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: mockUser,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('getServerSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    it('認証済みユーザーの場合 { user, session } を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const result = await getServerSession();

      expect(result).not.toBeNull();
      expect(result?.user).toEqual(mockUser);
      expect(result?.session).toEqual(mockSession);
    });

    it('user.id が正しく含まれること', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const result = await getServerSession();

      expect(result?.user.id).toBe('user-123');
    });

    it('認証済みで session が null の場合でも { user, session: null } を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const result = await getServerSession();

      expect(result).not.toBeNull();
      expect(result?.user).toEqual(mockUser);
      expect(result?.session).toBeNull();
    });

    it('認証済みの場合 getUser と getSession が両方呼ばれること', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      await getServerSession();

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 異常系: getUser エラー
  // -------------------------------------------------------------------------
  describe('getUser エラー', () => {
    it('getUser がエラーを返す場合 null を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired', status: 401 },
      });

      const result = await getServerSession();

      expect(result).toBeNull();
    });

    it('getUser がエラーの場合 getSession が呼ばれないこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired', status: 401 },
      });

      await getServerSession();

      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('getUser がネットワークエラーを返す場合 null を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Network error', status: 500 },
      });

      const result = await getServerSession();

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 異常系: user 不在
  // -------------------------------------------------------------------------
  describe('user 不在', () => {
    it('getUser が user=null を返す場合 null を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await getServerSession();

      expect(result).toBeNull();
    });

    it('user=null の場合 getSession が呼ばれないこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await getServerSession();

      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('user=undefined の場合 null を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: undefined },
        error: null,
      });

      const result = await getServerSession();

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 異常系: 予期せぬ例外
  // -------------------------------------------------------------------------
  describe('予期せぬ例外', () => {
    it('getUser が例外を throw する場合 null を返すこと', async () => {
      mockGetUser.mockRejectedValue(new Error('Unexpected network failure'));

      const result = await getServerSession();

      expect(result).toBeNull();
    });

    it('getUser が例外を throw する場合 console.error が呼ばれること', async () => {
      const error = new Error('Unexpected network failure');
      mockGetUser.mockRejectedValue(error);

      await getServerSession();

      expect(console.error).toHaveBeenCalledWith(
        '[getServerSession] unexpected error:',
        error
      );
    });

    it('getSession が例外を throw する場合 null を返すこと', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockGetSession.mockRejectedValue(new Error('Session fetch failed'));

      const result = await getServerSession();

      expect(result).toBeNull();
    });

    it('getSession が例外を throw する場合 console.error が呼ばれること', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      const error = new Error('Session fetch failed');
      mockGetSession.mockRejectedValue(error);

      await getServerSession();

      expect(console.error).toHaveBeenCalledWith(
        '[getServerSession] unexpected error:',
        error
      );
    });

    it('createClient が例外を throw する場合 null を返すこと', async () => {
      const { createClient } = jest.requireMock('@/lib/supabase/server');
      createClient.mockRejectedValueOnce(new Error('Client creation failed'));

      const result = await getServerSession();

      expect(result).toBeNull();
    });
  });
});
