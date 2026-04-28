/**
 * src/app/(main)/layout.tsx のテスト
 *
 * Server Component のテスト。Jest の制約により React レンダリングは省略し、
 * MainLayout 関数の非同期ロジック（認証チェック + redirect + getPlanSummary 呼び出し）
 * を直接呼び出して検証する。
 *
 * 検証観点:
 * - 認証済みの場合: children をレンダリング（redirect しない）
 * - 認証済みの場合: getPlanSummary が session.user.id で呼ばれること
 * - 未認証の場合: redirect('/login') が throw されること
 * - 未認証の場合: getPlanSummary は呼ばれないこと
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
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// getPlanSummary をモック
jest.mock('@/features/billing/lib/get-plan-summary', () => ({
  getPlanSummary: jest.fn(),
}));

import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getPlanSummary } from '@/features/billing/lib/get-plan-summary';
import MainLayout from '../layout';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetPlanSummary = getPlanSummary as jest.MockedFunction<typeof getPlanSummary>;

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

/** getPlanSummary のデフォルト戻り値 (overages 空) */
const mockPlanSummaryDefault = {
  subscription: {
    plan_id: 'free',
    status: 'active',
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_customer_id: null,
  },
  currentPlan: null,
  plans: [],
  overages: [],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('MainLayout (src/app/(main)/layout.tsx)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // getPlanSummary はデフォルトで overages 空を返す
    mockGetPlanSummary.mockResolvedValue(mockPlanSummaryDefault);
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

  // -------------------------------------------------------------------------
  // OverLimitBanner 表示制御: getPlanSummary 呼び出し検証
  // -------------------------------------------------------------------------
  describe('OverLimitBanner 表示制御', () => {
    it('認証済みの場合 getPlanSummary が session.user.id で1回呼ばれること', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      await MainLayout({ children: mockChildren });

      expect(mockGetPlanSummary).toHaveBeenCalledTimes(1);
      expect(mockGetPlanSummary).toHaveBeenCalledWith('user-123');
    });

    it('getPlanSummary が overages を返す場合 layout が正常終了すること', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetPlanSummary.mockResolvedValue({
        ...mockPlanSummaryDefault,
        overages: [{ resource: 'tree', current: 3, limit: 1 }],
      });

      await expect(MainLayout({ children: mockChildren })).resolves.not.toThrow();
    });

    it('overages が空配列の場合でも layout は正常終了すること', async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetPlanSummary.mockResolvedValue(mockPlanSummaryDefault);

      await expect(MainLayout({ children: mockChildren })).resolves.not.toThrow();
    });

    it('未認証の場合 getPlanSummary は呼ばれないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(MainLayout({ children: mockChildren })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockGetPlanSummary).not.toHaveBeenCalled();
    });
  });
});
