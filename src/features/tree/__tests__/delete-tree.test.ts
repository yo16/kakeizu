/**
 * deleteTree Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・DELETE・revalidatePath を検証する。
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
import { deleteTree } from '../actions/delete-tree';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

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

/**
 * from() モックを設定するヘルパー。
 * 1回目: 所有権確認 (select→eq→eq→single)
 * 2回目: DELETE (delete→eq→eq) — Promise として解決
 */
function buildFromMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  deleteError?: unknown;
}) {
  const { ownershipResult, deleteError = null } = options;

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
      singleFn.mockResolvedValue(ownershipResult);
    } else if (currentCall === 2) {
      // DELETE チェーン: 最後の eq が Promise を返す
      const deleteChain: Record<string, unknown> = {};
      let eqCallCount = 0;
      const deleteEqFn = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return Promise.resolve({ error: deleteError });
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

describe('deleteTree', () => {
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

      const result = await deleteTree({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await deleteTree({ treeId: TREE_ID });

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
      const result = await deleteTree({ treeId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteTree({ treeId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deleteTree({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await deleteTree({ treeId: 'not-a-uuid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 所有権なし → FORBIDDEN
  // ---------------------------------------------------------------------------
  describe('所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが存在しない場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await deleteTree({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await deleteTree({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('所有権確認クエリに owner_user_id フィルタが付いていること', async () => {
      const { mockFrom } = buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        deleteError: null,
      });

      await deleteTree({ treeId: TREE_ID });

      const ownershipChain = mockFrom.mock.results[0].value as Record<string, jest.Mock>;
      expect(ownershipChain.eq).toHaveBeenCalledWith('owner_user_id', USER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE クエリの owner_user_id フィルタ確認
  // ---------------------------------------------------------------------------
  describe('DELETE クエリの owner_user_id フィルタ', () => {
    it('DELETE クエリに owner_user_id フィルタが付いていること', async () => {
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
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentCall === 2) {
          const deleteChain: Record<string, unknown> = {};
          let eqCallCount = 0;
          const deleteEqFn = jest.fn().mockImplementation((col: string, val: unknown) => {
            capturedDeleteEqArgs.push([col, val]);
            eqCallCount++;
            if (eqCallCount >= 2) {
              return Promise.resolve({ error: null });
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

      await deleteTree({ treeId: TREE_ID });

      expect(capturedDeleteEqArgs).toEqual(
        expect.arrayContaining([['owner_user_id', USER_ID]])
      );
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
        ownershipResult: { data: { id: TREE_ID }, error: null },
        deleteError: null,
      });

      const result = await deleteTree({ treeId: TREE_ID });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath("/dashboard") が呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        deleteError: null,
      });

      await deleteTree({ treeId: TREE_ID });

      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DELETE エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DELETE でエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
      });

      const result = await deleteTree({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DELETE エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
      });

      await deleteTree({ treeId: TREE_ID });

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
