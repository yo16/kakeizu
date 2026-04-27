/**
 * createShareLink Server Action のユニットテスト
 *
 * 認証・バリデーション・INSERT (UNIQUE 違反リトライ含む) を検証する。
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

// ulid をモック（固定値を返す）
jest.mock('ulid', () => ({
  ulid: jest.fn(() => '01HXXXXXXXXXXXXXXXXXXX0000'),
}));

import { createShareLink } from '../createShareLink';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
const LINK_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Supabase の insert チェーンをモックするヘルパー。
 * .from().insert().select().single() をシミュレートする。
 * insertResults を渡すと複数回呼び出し時に順番に結果を返す（リトライテスト用）。
 */
function buildInsertMock(insertResults: { data: unknown; error: unknown }[]) {
  let callCount = 0;
  const singleFn = jest.fn().mockImplementation(() => {
    const result = insertResults[callCount] ?? insertResults[insertResults.length - 1];
    callCount++;
    return Promise.resolve(result);
  });
  const selectFn = jest.fn().mockReturnValue({ single: singleFn });
  const insertFn = jest.fn().mockReturnValue({ select: selectFn });
  const fromFn = jest.fn().mockReturnValue({ insert: insertFn });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: fromFn } as any);
  return { fromFn, insertFn, selectFn, singleFn };
}

/** 正常な INSERT 結果 */
const successInsertResult = {
  data: {
    id: LINK_ID,
    tree_id: TREE_ID,
    token: 'SOME_TOKEN',
    is_enabled: true,
    created_at: '2026-04-27T00:00:00.000Z',
  },
  error: null,
};

/** tree_id UNIQUE 違反エラー */
const treeIdUniqueError = {
  data: null,
  error: { code: '23505', message: 'duplicate key value violates unique constraint "share_link_tree_id_key"' },
};

/** token UNIQUE 違反エラー（tree_id を含まないメッセージ） */
const tokenUniqueError = {
  data: null,
  error: { code: '23505', message: 'duplicate key value violates unique constraint "share_link_token_key"' },
};

describe('createShareLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
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

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createShareLink({ treeId: TREE_ID });

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
      const result = await createShareLink({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createShareLink({ treeId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が undefined の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createShareLink({ treeId: undefined });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が null の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createShareLink(null);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await createShareLink({ treeId: 'invalid' });

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

    it('成功時に ok: true と ShareLink データを返すこと', async () => {
      buildInsertMock([successInsertResult]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: {
          id: LINK_ID,
          treeId: TREE_ID,
          token: expect.any(String),
          isEnabled: true,
          createdAt: '2026-04-27T00:00:00.000Z',
        },
      });
    });

    it('戻り値の token が ULID_base64url 形式に合致すること', async () => {
      // INSERT 結果の token を実際のトークン形式に近い値でモック
      const tokenPattern = /^[0-9A-Z]{26}_[A-Za-z0-9_-]+$/;
      buildInsertMock([{
        data: {
          ...successInsertResult.data,
          token: '01HXXXXXXXXXXXXXXXXXXX0000_dGVzdA',
        },
        error: null,
      }]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.token).toMatch(tokenPattern);
      }
    });

    it('Supabase の insert が tree_id と token を含む形式で呼ばれること', async () => {
      const { insertFn } = buildInsertMock([successInsertResult]);

      await createShareLink({ treeId: TREE_ID });

      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          tree_id: TREE_ID,
          token: expect.any(String),
        })
      );
    });

    it('insert の token 引数が ULID_base64url 形式であること', async () => {
      const ulidBase64urlPattern = /^[0-9A-Z]{26}_[A-Za-z0-9_-]+$/;
      const { insertFn } = buildInsertMock([successInsertResult]);

      await createShareLink({ treeId: TREE_ID });

      const [insertArg] = insertFn.mock.calls[0];
      expect(insertArg.token).toMatch(ulidBase64urlPattern);
    });

    it('insert の token に "_" が含まれ ULID 部分が 26 文字であること', async () => {
      const { insertFn } = buildInsertMock([successInsertResult]);

      await createShareLink({ treeId: TREE_ID });

      const [insertArg] = insertFn.mock.calls[0];
      const [ulidPart] = insertArg.token.split('_');
      expect(ulidPart).toHaveLength(26);
    });
  });

  // ---------------------------------------------------------------------------
  // tree_id UNIQUE 違反 → ALREADY_EXISTS (リトライなし)
  // ---------------------------------------------------------------------------
  describe('tree_id UNIQUE 違反', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('tree_id UNIQUE 違反時に ALREADY_EXISTS を返すこと', async () => {
      buildInsertMock([treeIdUniqueError]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'ALREADY_EXISTS' }),
      });
    });

    it('tree_id UNIQUE 違反時にリトライしないこと（insert が 1 回だけ呼ばれること）', async () => {
      const { insertFn } = buildInsertMock([treeIdUniqueError]);

      await createShareLink({ treeId: TREE_ID });

      expect(insertFn).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // token UNIQUE 違反 → リトライロジック
  // ---------------------------------------------------------------------------
  describe('token UNIQUE 違反リトライ', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('1 回 token 衝突後に成功した場合 ok: true を返すこと', async () => {
      buildInsertMock([tokenUniqueError, successInsertResult]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ id: LINK_ID }),
      });
    });

    it('2 回 token 衝突後に成功した場合 ok: true を返すこと', async () => {
      buildInsertMock([tokenUniqueError, tokenUniqueError, successInsertResult]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ id: LINK_ID }),
      });
    });

    it('3 回連続 token 衝突した場合 INTERNAL_ERROR を返すこと', async () => {
      buildInsertMock([tokenUniqueError, tokenUniqueError, tokenUniqueError]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('3 回連続 token 衝突時に insert が 3 回呼ばれること', async () => {
      const { insertFn } = buildInsertMock([tokenUniqueError, tokenUniqueError, tokenUniqueError]);

      await createShareLink({ treeId: TREE_ID });

      expect(insertFn).toHaveBeenCalledTimes(3);
    });

    it('1 回衝突後成功した場合に insert が 2 回呼ばれること', async () => {
      const { insertFn } = buildInsertMock([tokenUniqueError, successInsertResult]);

      await createShareLink({ treeId: TREE_ID });

      expect(insertFn).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // その他の INSERT エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('一般的な INSERT エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UNIQUE 違反以外の DB エラー時に INTERNAL_ERROR を返すこと', async () => {
      buildInsertMock([{
        data: null,
        error: { code: '42000', message: 'DB error' },
      }]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('data が null でエラーもない場合 INTERNAL_ERROR を返すこと', async () => {
      buildInsertMock([{ data: null, error: null }]);

      const result = await createShareLink({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });
});
