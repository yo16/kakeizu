/**
 * getTreeOverview Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・tree + 人物数 + 写真数の取得を検証する。
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

import { getTreeOverview } from '../actions/get-tree-overview';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** テスト用ツリーデータ */
const MOCK_TREE_ROW = {
  id: TREE_ID,
  title: 'テストツリー',
  description: 'テスト説明',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
};

/**
 * from() モックを設定するヘルパー。
 * 1回目: tree 所有権確認 (select→eq→eq→single)
 * 2回目: person count (select→eq)
 * 3回目: photo count (select→eq)
 */
function buildFromMock(options: {
  treeResult: { data: unknown; error: unknown };
  personCountResult: { count: number | null; error: unknown };
  photoCountResult: { count: number | null; error: unknown };
}) {
  const { treeResult, personCountResult, photoCountResult } = options;

  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    callIndex++;
    const currentCall = callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    const eqFn = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = eqFn;
    chain.single = singleFn;

    if (currentCall === 1) {
      // tree 所有権確認
      singleFn.mockResolvedValue(treeResult);
    } else if (currentCall === 2) {
      // person count: select().eq() が Promise を返す
      const personChain: Record<string, unknown> = {};
      personChain.eq = jest.fn().mockResolvedValue(personCountResult);
      chain.select = jest.fn().mockReturnValue(personChain);
    } else if (currentCall === 3) {
      // photo count: select().eq() が Promise を返す
      const photoChain: Record<string, unknown> = {};
      photoChain.eq = jest.fn().mockResolvedValue(photoCountResult);
      chain.select = jest.fn().mockReturnValue(photoChain);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

describe('getTreeOverview', () => {
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

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await getTreeOverview({ treeId: TREE_ID });

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

    it('treeId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getTreeOverview({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await getTreeOverview({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし / 存在しない → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('所有権なし / 存在しない', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが存在しない場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        treeResult: { data: null, error: { code: 'PGRST116' } },
        personCountResult: { count: 0, error: null },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーの場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        treeResult: { data: null, error: null },
        personCountResult: { count: 0, error: null },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('tree + 人物数 + 写真数が正しく返ること', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: 5, error: null },
        photoCountResult: { count: 3, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: {
          tree: {
            id: TREE_ID,
            title: 'テストツリー',
            description: 'テスト説明',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
          counts: {
            persons: 5,
            photos: 3,
          },
        },
      });
    });

    it('人物数が 0 のケースで正しく返ること', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: 0, error: null },
        photoCountResult: { count: 2, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({
          counts: expect.objectContaining({ persons: 0 }),
        }),
      });
    });

    it('写真数が 0 のケースで正しく返ること', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: 3, error: null },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({
          counts: expect.objectContaining({ photos: 0 }),
        }),
      });
    });

    it('人物数・写真数が両方 0 のケースで正しく返ること', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: 0, error: null },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({
          counts: { persons: 0, photos: 0 },
        }),
      });
    });

    it('count が null の場合 0 として扱われること', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: null, error: null },
        photoCountResult: { count: null, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({
          counts: { persons: 0, photos: 0 },
        }),
      });
    });

    it('description が null のツリーでも正しく返ること', async () => {
      const treeRowWithNullDesc = {
        ...MOCK_TREE_ROW,
        description: null,
      };
      buildFromMock({
        treeResult: { data: treeRowWithNullDesc, error: null },
        personCountResult: { count: 1, error: null },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({
          tree: expect.objectContaining({ description: null }),
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // person count エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('person count エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('person count クエリでエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: null, error: { code: '42000', message: 'DB error' } },
        photoCountResult: { count: 0, error: null },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // photo count エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('photo count エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('photo count クエリでエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        treeResult: { data: MOCK_TREE_ROW, error: null },
        personCountResult: { count: 3, error: null },
        photoCountResult: { count: null, error: { code: '42000', message: 'DB error' } },
      });

      const result = await getTreeOverview({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });
});
