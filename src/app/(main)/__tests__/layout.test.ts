/**
 * src/app/(main)/layout.tsx のテスト
 *
 * Server Component のテスト。Jest の制約により React レンダリングは省略し、
 * MainLayout 関数の非同期ロジック（認証チェック + redirect）を直接呼び出して検証する。
 *
 * 検証観点:
 * - 認証済みの場合: children をレンダリング（redirect しない）
 * - 未認証の場合: redirect('/login') が throw されること
 *
 * @jest-environment node
 */

// server-only モジュールをモック（server.ts 経由で使われる）
jest.mock('server-only', () => ({}));

// next/navigation の redirect をモック（NEXT_REDIRECT をスロー）
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${path}` });
  }),
}));

// getServerSession をモック
const mockGetServerSession = jest.fn();
jest.mock('@/lib/auth/session', () => ({
  getServerSession: mockGetServerSession,
}));

import { redirect } from 'next/navigation';
import MainLayout from '../layout';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

/** テスト用 children（Server Component のため React 要素でなくても動作確認可能）*/
const mockChildren = null;

/** テスト用 ServerSession */
const mockSession = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  },
  session: {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('MainLayout (src/app/(main)/layout.tsx)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 正常系: 認証済み → children をレンダリング
  // -------------------------------------------------------------------------
  describe('認証済みの場合', () => {
    it('getServerSession が認証済みセッションを返す場合 redirect が呼ばれないこと', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      // Server Component を非同期関数として呼び出す
      // React.createElement の戻り値ではなく、ロジックの検証に集中する
      await MainLayout({ children: mockChildren });

      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('getServerSession が認証済みセッションを返す場合 例外が throw されないこと', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      await expect(MainLayout({ children: mockChildren })).resolves.not.toThrow();
    });

    it('getServerSession が一度呼ばれること', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      await MainLayout({ children: mockChildren });

      expect(mockGetServerSession).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 異常系: 未認証 → redirect('/login') throw
  // -------------------------------------------------------------------------
  describe('未認証の場合', () => {
    it('getServerSession が null を返す場合 NEXT_REDIRECT が throw されること', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(MainLayout({ children: mockChildren })).rejects.toThrow('NEXT_REDIRECT');
    });

    it('getServerSession が null の場合 redirect が /login で呼ばれること', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(MainLayout({ children: mockChildren })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('getServerSession が null の場合 redirect が一度だけ呼ばれること', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(MainLayout({ children: mockChildren })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it('getServerSession が undefined を返す場合も redirect が呼ばれること', async () => {
      mockGetServerSession.mockResolvedValue(undefined);

      await expect(MainLayout({ children: mockChildren })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });
  });
});
