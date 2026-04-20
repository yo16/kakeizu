/**
 * setPrimaryPhoto Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・photo_person_link 検証・UPDATE・revalidatePath を検証する。
 * setPrimaryPhoto は3つの Supabase クエリを実行する:
 *   1回目: JOIN で人物取得と所有権確認
 *   2回目: photo_person_link の存在確認
 *   3回目: primary_photo_id の UPDATE (count: 'exact')
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
import { setPrimaryPhoto } from '../actions/set-primary-photo';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PHOTO_ID  = 'dddddddd-0000-0000-0000-000000000001';

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
 * 1回目: JOIN で人物取得と所有権確認 (person テーブル, select→eq→eq→single)
 * 2回目: photo_person_link の存在確認 (select→eq→eq→single)
 * 3回目: primary_photo_id の UPDATE with count (update→eq→eq)
 */
function buildFromMock(options: {
  fetchPersonResult: { data: unknown; error: unknown };
  fetchLinkResult?: { data: unknown; error: unknown };
  updateError?: unknown;
  updateCount?: number;
}) {
  const {
    fetchPersonResult,
    fetchLinkResult = { data: { photo_id: PHOTO_ID }, error: null },
    updateError = null,
    updateCount = 1,
  } = options;

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
      // person JOIN クエリ
      singleFn.mockResolvedValue(fetchPersonResult);
    } else if (currentCall === 2) {
      // photo_person_link 確認クエリ
      singleFn.mockResolvedValue(fetchLinkResult);
    } else if (currentCall === 3) {
      // UPDATE primary_photo_id with count
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

/** 有効な setPrimaryPhoto 入力データ */
const validInput = { personId: PERSON_ID, photoId: PHOTO_ID };

describe('setPrimaryPhoto', () => {
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

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await setPrimaryPhoto(validInput);

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
      const result = await setPrimaryPhoto({ personId: 'not-a-uuid', photoId: PHOTO_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('photoId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await setPrimaryPhoto({ personId: PERSON_ID, photoId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await setPrimaryPhoto({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await setPrimaryPhoto({ personId: 'not-a-uuid', photoId: PHOTO_ID });

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
        fetchPersonResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーに属する人物の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: null, error: null },
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // photo_person_link 未存在 → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('photo_person_link 未存在', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('photo_person_link が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('photo_person_link data が null の場合 NOT_FOUND を返すこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: null, error: null },
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('UPDATE エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UPDATE エラーがある場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: { photo_id: PHOTO_ID }, error: null },
        updateError: { code: '42000', message: 'DB error' },
        updateCount: 0,
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('UPDATE count が 0 の場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: { photo_id: PHOTO_ID }, error: null },
        updateError: null,
        updateCount: 0,
      });

      const result = await setPrimaryPhoto(validInput);

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

    it('primary_photo_id の更新に成功すること', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: { photo_id: PHOTO_ID }, error: null },
        updateError: null,
        updateCount: 1,
      });

      const result = await setPrimaryPhoto(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: { photo_id: PHOTO_ID }, error: null },
        updateError: null,
        updateCount: 1,
      });

      await setPrimaryPhoto(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('UPDATE エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        fetchPersonResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        fetchLinkResult: { data: { photo_id: PHOTO_ID }, error: null },
        updateError: { code: '42000', message: 'DB error' },
        updateCount: 0,
      });

      await setPrimaryPhoto(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
