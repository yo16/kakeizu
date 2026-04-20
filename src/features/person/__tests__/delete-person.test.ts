/**
 * deletePerson Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・DELETE・revalidatePath を検証する。
 * deletePerson は JOIN クエリで所有権確認と人物取得を1回のクエリで行い、
 * 確認済み tree_id を使って DELETE する (TOCTOU対策)。
 * DELETE は count: 'exact' で 0件削除を検出する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// next/cache をモック
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { revalidatePath } from 'next/cache';
import { deletePerson } from '../actions/delete-person';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * from() モックを設定するヘルパー。
 * 1回目: JOIN で人物取得と所有権確認 (select→eq→eq→single)
 * 2回目: DELETE with count (delete→eq→eq) — 最後の eq を Promise として解決
 */
function buildFromMock(options: {
  fetchResult: { data: unknown; error: unknown };
  deleteError?: unknown;
  deleteCount?: number;
}) {
  const { fetchResult, deleteError = null, deleteCount = 1 } = options;

  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    callIndex++;
    const currentCall = callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    chain.delete = jest.fn().mockReturnValue(chain);

    if (currentCall === 1) {
      // JOIN 所有権確認クエリ
      singleFn.mockResolvedValue(fetchResult);
    } else if (currentCall === 2) {
      // DELETE with count クエリ: 最後の eq が Promise を返す
      const deleteChain: Record<string, unknown> = {};
      let eqCallCount = 0;
      const deleteEqFn = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return Promise.resolve({ error: deleteError, count: deleteCount });
        }
        return deleteChain;
      });
      deleteChain.eq = deleteEqFn;
      chain.delete = jest.fn().mockReturnValue(deleteChain);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な deletePerson 入力データ */
const validInput = { personId: PERSON_ID };

describe('deletePerson', () => {
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

      const result = await deletePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await deletePerson(validInput);

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

    it('personId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deletePerson({ personId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deletePerson({ personId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deletePerson({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await deletePerson({ personId: 'not-a-uuid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('人物が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await deletePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーに属する人物の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: null, error: null },
      });

      const result = await deletePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE クエリの eq('tree_id', ...) 検証
  // ---------------------------------------------------------------------------
  describe('DELETE クエリの tree_id フィルタ', () => {
    it('DELETE クエリに tree_id フィルタが付いていること', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      const capturedDeleteEqArgs: Array<[string, unknown]> = [];
      const mockFrom = jest.fn().mockImplementation(() => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;
        chain.delete = jest.fn().mockReturnValue(chain);

        if (currentCall === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null });
        } else if (currentCall === 2) {
          const deleteChain: Record<string, unknown> = {};
          let eqCallCount = 0;
          const deleteEqFn = jest.fn().mockImplementation((col: string, val: unknown) => {
            capturedDeleteEqArgs.push([col, val]);
            eqCallCount++;
            if (eqCallCount >= 2) {
              return Promise.resolve({ error: null, count: 1 });
            }
            return deleteChain;
          });
          deleteChain.eq = deleteEqFn;
          chain.delete = jest.fn().mockReturnValue(deleteChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await deletePerson(validInput);

      expect(capturedDeleteEqArgs).toEqual(
        expect.arrayContaining([['tree_id', TREE_ID]])
      );
    });
  });

  // ---------------------------------------------------------------------------
  // count 0 件 → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DELETE count 0件', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DELETE の count が 0 の場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 0,
      });

      const result = await deletePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DELETE エラーがある場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
        deleteCount: 0,
      });

      const result = await deletePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
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

    it('削除に成功すること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 1,
      });

      const result = await deletePerson(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 1,
      });

      await deletePerson(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('DELETE エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
        deleteCount: 0,
      });

      await deletePerson(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
