/**
 * updatePerson Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・UPDATE・revalidatePath を検証する。
 * updatePerson は JOIN クエリで所有権確認と人物取得を1回のクエリで行い、
 * 確認済み tree_id を使って UPDATE する (TOCTOU対策)。
 * UPDATE は count: 'exact' で 0件更新を検出する。
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
import { updatePerson } from '../actions/update-person';
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
 * 2回目: UPDATE with count (update→eq→eq) — 最後の eq を Promise として解決
 */
function buildFromMock(options: {
  fetchResult: { data: unknown; error: unknown };
  updateError?: unknown;
  updateCount?: number;
}) {
  const { fetchResult, updateError = null, updateCount = 1 } = options;

  let callIndex = 0;
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
      // JOIN 所有権確認クエリ
      singleFn.mockResolvedValue(fetchResult);
    } else if (currentCall === 2) {
      // UPDATE with count クエリ: 最後の eq が Promise を返す
      const updateChain: Record<string, unknown> = {};
      let eqCallCount = 0;
      const updateEqFn = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return Promise.resolve({ error: updateError, count: updateCount });
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

/** 有効な updatePerson 入力データ */
const validInput = {
  personId: PERSON_ID,
  displayName: '山田次郎',
};

describe('updatePerson', () => {
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

      const result = await updatePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await updatePerson(validInput);

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

    it('personId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updatePerson({ personId: 'not-a-uuid', displayName: '更新' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personId のみ指定で更新フィールドが何もない場合 VALIDATION_ERROR を返すこと (refine)', async () => {
      const result = await updatePerson({ personId: PERSON_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('displayName が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updatePerson({ personId: PERSON_ID, displayName: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('displayName が 201 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updatePerson({ personId: PERSON_ID, displayName: 'あ'.repeat(201) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await updatePerson({ personId: PERSON_ID });

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

    it('JOIN 結果が null かつ error あり の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await updatePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('JOIN 結果が null かつ error なし の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: null, error: null },
      });

      const result = await updatePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE クエリの eq('tree_id', ...) 検証
  // ---------------------------------------------------------------------------
  describe('UPDATE クエリの tree_id フィルタ', () => {
    it('UPDATE クエリに tree_id フィルタが付いていること', async () => {
      setupAuthenticatedSession();

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
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null });
        } else if (currentCall === 2) {
          const updateChain: Record<string, unknown> = {};
          let eqCallCount = 0;
          const updateEqFn = jest.fn().mockImplementation((col: string, val: unknown) => {
            capturedUpdateEqArgs.push([col, val]);
            eqCallCount++;
            if (eqCallCount >= 2) {
              return Promise.resolve({ error: null, count: 1 });
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

      await updatePerson(validInput);

      expect(capturedUpdateEqArgs).toEqual(
        expect.arrayContaining([['tree_id', TREE_ID]])
      );
    });
  });

  // ---------------------------------------------------------------------------
  // count 0 件 → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('UPDATE count 0件', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UPDATE の count が 0 の場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 0,
      });

      const result = await updatePerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('UPDATE エラーがある場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: { code: '42000', message: 'DB error' },
        updateCount: 0,
      });

      const result = await updatePerson(validInput);

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

    it('displayName のみ更新して成功すること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 1,
      });

      const result = await updatePerson({ personId: PERSON_ID, displayName: '山田次郎' });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('複数フィールドを更新して成功すること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 1,
      });

      const result = await updatePerson({
        personId: PERSON_ID,
        displayName: '山田次郎',
        familyName: '山田',
        gender: 'male',
        birth: { year: 1985, month: 3 },
        isAlive: true,
      });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('null 値のフィールドを更新して成功すること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 1,
      });

      const result = await updatePerson({
        personId: PERSON_ID,
        familyName: null,
        note: null,
      });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 1,
      });

      await updatePerson(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('UPDATE エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: { code: '42000', message: 'DB error' },
        updateCount: 0,
      });

      await updatePerson(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
