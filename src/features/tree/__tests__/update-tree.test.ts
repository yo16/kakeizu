/**
 * updateTree Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・UPDATE・revalidatePath を検証する。
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
import { updateTree } from '../actions/update-tree';
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
 * 2回目: UPDATE (update→eq→eq) — 最後の eq が Promise 解決
 */
function buildFromMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  updateError?: unknown;
}) {
  const { ownershipResult, updateError = null } = options;

  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    callIndex++;
    const currentCall = callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    const eqFn = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.eq = eqFn;
    chain.single = singleFn;

    if (currentCall === 1) {
      // 所有権確認クエリ
      singleFn.mockResolvedValue(ownershipResult);
    } else if (currentCall === 2) {
      // UPDATE クエリ: 最後の eq を Promise として解決させる
      const updateChain: Record<string, unknown> = {};
      let eqCallCount = 0;
      const updateEqFn = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          // 最後の eq は Promise を返す
          return Promise.resolve({ error: updateError });
        }
        return updateChain;
      });
      updateChain.eq = updateEqFn;
      chain.update = jest.fn().mockReturnValue(updateChain);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

describe('updateTree', () => {
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

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

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
      const result = await updateTree({ treeId: 'not-a-uuid', title: '新タイトル' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('title と description が両方 undefined の場合 VALIDATION_ERROR を返すこと（refine）', async () => {
      const result = await updateTree({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('title が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateTree({ treeId: TREE_ID, title: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('title が 101 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateTree({ treeId: TREE_ID, title: 'あ'.repeat(101) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('description が 501 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updateTree({ treeId: TREE_ID, description: 'a'.repeat(501) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await updateTree({ treeId: TREE_ID });

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

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('所有権確認クエリに owner_user_id フィルタが付いていること', async () => {
      const { mockFrom } = buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      // 1回目の from() 呼び出し (所有権確認) の eq に owner_user_id が渡されていること
      const ownershipChain = mockFrom.mock.results[0].value as Record<string, jest.Mock>;
      expect(ownershipChain.eq).toHaveBeenCalledWith('owner_user_id', USER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE クエリの owner_user_id フィルタ確認
  // ---------------------------------------------------------------------------
  describe('UPDATE クエリの owner_user_id フィルタ', () => {
    it('UPDATE クエリに owner_user_id フィルタが付いていること', async () => {
      setupAuthenticatedSession();

      // カスタムモックで UPDATE クエリの eq 呼び出しを記録する
      let callIndex = 0;
      const capturedUpdateEqArgs: Array<[string, unknown]> = [];
      const mockFrom = jest.fn().mockImplementation(() => {
        callIndex++;
        const currentCall = callIndex;
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;
        chain.update = jest.fn().mockReturnValue(chain);

        if (currentCall === 1) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (currentCall === 2) {
          // UPDATE チェーン: eq 呼び出しを記録する
          const updateChain: Record<string, unknown> = {};
          let eqCallCount = 0;
          const updateEqFn = jest.fn().mockImplementation((col: string, val: unknown) => {
            capturedUpdateEqArgs.push([col, val]);
            eqCallCount++;
            if (eqCallCount >= 2) {
              return Promise.resolve({ error: null });
            }
            return updateChain;
          });
          updateChain.eq = updateEqFn;
          chain.update = jest.fn().mockReturnValue(updateChain);
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      // UPDATE クエリで owner_user_id フィルタが呼ばれていること
      expect(capturedUpdateEqArgs).toEqual(
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

    it('title のみ更新して成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('description のみ更新して成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      const result = await updateTree({ treeId: TREE_ID, description: '新しい説明' });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('title と description の両方を更新して成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル', description: '新説明' });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('description を null に更新して成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      const result = await updateTree({ treeId: TREE_ID, description: null });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath("/dashboard") が呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
    });

    it('revalidatePath("/dashboard/trees/{treeId}") が呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('revalidatePath が /dashboard と /dashboard/trees/{treeId} の両方に呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: null,
      });

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('UPDATE エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UPDATE でエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: { code: '42000', message: 'DB error' },
      });

      const result = await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('UPDATE エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        updateError: { code: '42000', message: 'DB error' },
      });

      await updateTree({ treeId: TREE_ID, title: '新タイトル' });

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
