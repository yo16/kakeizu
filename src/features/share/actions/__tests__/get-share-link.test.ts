/**
 * getShareLink Server Action のユニットテスト
 *
 * 認証・バリデーション・SELECT (is_enabled=true フィルタ) を検証する。
 *
 * @jest-environment node
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { getShareLink } from '../get-share-link';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const LINK_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Supabase の select チェーンをモックするヘルパー。
 * .from().select().eq().eq().maybeSingle() をシミュレートする。
 */
function buildSelectMock(result: { data: unknown; error: unknown }) {
  const maybeSingleFn = jest.fn().mockResolvedValue(result);
  const eq2Fn = jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const eq1Fn = jest.fn().mockReturnValue({ eq: eq2Fn });
  const selectFn = jest.fn().mockReturnValue({ eq: eq1Fn });
  const fromFn = jest.fn().mockReturnValue({ select: selectFn });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: fromFn } as any);
  return { fromFn, selectFn, eq1Fn, eq2Fn, maybeSingleFn };
}

/** 正常な SELECT 結果（リンクあり） */
const successSelectResult = {
  data: {
    id: LINK_ID,
    tree_id: TREE_ID,
    token: 'SOME_TOKEN_VALUE',
    is_enabled: true,
    created_at: '2026-04-27T00:00:00.000Z',
  },
  error: null,
};

/** リンクなし結果 */
const noDataResult = {
  data: null,
  error: null,
};

describe('getShareLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 未ログイン → UNAUTHENTICATED
  // ---------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await getShareLink({ treeId: TREE_ID });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーションエラー → VALIDATION_ERROR
  // ---------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('treeId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getShareLink({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getShareLink({ treeId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が null の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getShareLink(null);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await getShareLink({ treeId: 'invalid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('有効な共有リンクが存在する場合 ShareLink を返すこと', async () => {
      buildSelectMock(successSelectResult);

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: {
          id: LINK_ID,
          treeId: TREE_ID,
          token: 'SOME_TOKEN_VALUE',
          isEnabled: true,
          createdAt: '2026-04-27T00:00:00.000Z',
        },
      });
    });

    it('snake_case から camelCase へ変換されていること（treeId, isEnabled, createdAt）', async () => {
      buildSelectMock(successSelectResult);

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result.ok).toBe(true);
      if (result.ok && result.data !== null) {
        expect(result.data).toHaveProperty('treeId');
        expect(result.data).toHaveProperty('isEnabled');
        expect(result.data).toHaveProperty('createdAt');
        // snake_case のプロパティが存在しないこと
        expect(result.data).not.toHaveProperty('tree_id');
        expect(result.data).not.toHaveProperty('is_enabled');
        expect(result.data).not.toHaveProperty('created_at');
      }
    });

    it('共有リンクが存在しない場合 null を返すこと', async () => {
      buildSelectMock(noDataResult);

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: null,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 検索条件の検証
  // ---------------------------------------------------------------------------
  describe('検索条件', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('.eq("tree_id", treeId) が呼ばれること', async () => {
      const { eq1Fn } = buildSelectMock(successSelectResult);

      await getShareLink({ treeId: TREE_ID });

      expect(eq1Fn).toHaveBeenCalledWith('tree_id', TREE_ID);
    });

    it('.eq("is_enabled", true) が呼ばれること', async () => {
      const { eq2Fn } = buildSelectMock(successSelectResult);

      await getShareLink({ treeId: TREE_ID });

      expect(eq2Fn).toHaveBeenCalledWith('is_enabled', true);
    });

    it('"share_link" テーブルが検索対象であること', async () => {
      const { fromFn } = buildSelectMock(successSelectResult);

      await getShareLink({ treeId: TREE_ID });

      expect(fromFn).toHaveBeenCalledWith('share_link');
    });
  });

  // ---------------------------------------------------------------------------
  // DB エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DBエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DB エラー時に INTERNAL_ERROR を返すこと', async () => {
      buildSelectMock({
        data: null,
        error: { code: '42000', message: 'DB error' },
      });

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DB エラー時にエラーメッセージが含まれること', async () => {
      buildSelectMock({
        data: null,
        error: { code: '42000', message: 'DB error' },
      });

      const result = await getShareLink({ treeId: TREE_ID });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBeTruthy();
      }
    });
  });
});
