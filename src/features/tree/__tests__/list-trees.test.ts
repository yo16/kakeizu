/**
 * listTrees Server Action のユニットテスト
 *
 * 認証・DB取得・空配列・エラーハンドリングを検証する。
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

import { listTrees } from '../actions/list-trees';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** テスト用ツリーデータ */
const MOCK_TREE_ROW_1 = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  title: 'ツリー1',
  description: '説明1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_TREE_ROW_2 = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  title: 'ツリー2',
  description: null,
  created_at: '2024-01-02T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
};

const MOCK_TREE_ROW_3 = {
  id: 'bbbbbbbb-0000-0000-0000-000000000003',
  title: 'ツリー3',
  description: '説明3',
  created_at: '2024-01-03T00:00:00.000Z',
  updated_at: '2024-01-03T00:00:00.000Z',
};

/**
 * from() モックを設定するヘルパー。
 * select → eq → order → Promise として解決
 */
function buildFromMock(queryResult: { data: unknown[] | null; error: unknown }) {
  const orderFn = jest.fn().mockResolvedValue(queryResult);
  const eqFn = jest.fn().mockReturnValue({ order: orderFn });
  const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
  const mockFrom = jest.fn().mockReturnValue({ select: selectFn });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom, selectFn, eqFn, orderFn };
}

describe('listTrees', () => {
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

      const result = await listTrees();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await listTrees();

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: 複数ツリー取得
  // ---------------------------------------------------------------------------
  describe('正常系: 複数ツリー取得', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('複数ツリーが正しく返ること', async () => {
      buildFromMock({
        data: [MOCK_TREE_ROW_1, MOCK_TREE_ROW_2],
        error: null,
      });

      const result = await listTrees();

      expect(result).toEqual({
        ok: true,
        data: [
          {
            id: MOCK_TREE_ROW_1.id,
            title: MOCK_TREE_ROW_1.title,
            description: MOCK_TREE_ROW_1.description,
            createdAt: MOCK_TREE_ROW_1.created_at,
            updatedAt: MOCK_TREE_ROW_1.updated_at,
          },
          {
            id: MOCK_TREE_ROW_2.id,
            title: MOCK_TREE_ROW_2.title,
            description: MOCK_TREE_ROW_2.description,
            createdAt: MOCK_TREE_ROW_2.created_at,
            updatedAt: MOCK_TREE_ROW_2.updated_at,
          },
        ],
      });
    });

    it('DB が created_at 降順（descending）で返したデータをそのまま返すこと', async () => {
      // DB から降順で返ってくるデータを模擬（新しいものが先頭）
      buildFromMock({
        data: [MOCK_TREE_ROW_3, MOCK_TREE_ROW_2, MOCK_TREE_ROW_1],
        error: null,
      });

      const result = await listTrees();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].id).toBe(MOCK_TREE_ROW_3.id);
        expect(result.data[1].id).toBe(MOCK_TREE_ROW_2.id);
        expect(result.data[2].id).toBe(MOCK_TREE_ROW_1.id);
      }
    });

    it('order クエリが ascending: false（降順）で呼ばれること', async () => {
      const { orderFn } = buildFromMock({
        data: [MOCK_TREE_ROW_1],
        error: null,
      });

      await listTrees();

      expect(orderFn).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('description が null のツリーも正しく返ること', async () => {
      buildFromMock({
        data: [MOCK_TREE_ROW_2],
        error: null,
      });

      const result = await listTrees();

      expect(result).toEqual({
        ok: true,
        data: [
          expect.objectContaining({ description: null }),
        ],
      });
    });

    it('eq クエリに owner_user_id と userId が渡されること', async () => {
      const { eqFn } = buildFromMock({
        data: [MOCK_TREE_ROW_1],
        error: null,
      });

      await listTrees();

      expect(eqFn).toHaveBeenCalledWith('owner_user_id', USER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // 0件のケース → 空配列
  // ---------------------------------------------------------------------------
  describe('0件のケース', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが0件の場合 空配列を返すこと', async () => {
      buildFromMock({
        data: [],
        error: null,
      });

      const result = await listTrees();

      expect(result).toEqual({
        ok: true,
        data: [],
      });
    });

    it('data が null の場合 空配列を返すこと', async () => {
      buildFromMock({
        data: null,
        error: null,
      });

      const result = await listTrees();

      expect(result).toEqual({
        ok: true,
        data: [],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DB エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DB エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DB エラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        data: null,
        error: { code: '42000', message: 'connection refused' },
      });

      const result = await listTrees();

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DB エラー時にエラーログが出力されること', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      buildFromMock({
        data: null,
        error: { code: '42000', message: 'DB error' },
      });

      await listTrees();

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // データマッピング
  // ---------------------------------------------------------------------------
  describe('データマッピング', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DB の snake_case フィールドが camelCase にマッピングされること', async () => {
      buildFromMock({
        data: [MOCK_TREE_ROW_1],
        error: null,
      });

      const result = await listTrees();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const item = result.data[0];
        // snake_case フィールドが存在しないこと
        expect(item).not.toHaveProperty('created_at');
        expect(item).not.toHaveProperty('updated_at');
        // camelCase フィールドが存在すること
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('updatedAt');
      }
    });
  });
});
