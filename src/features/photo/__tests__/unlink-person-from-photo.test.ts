/**
 * unlinkPersonFromPhoto Server Action のユニットテスト
 *
 * 認証・バリデーション・photo 所有権確認（tree!inner JOIN）・
 * DELETE（エラー/count 0）・revalidatePath を検証する。
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
import { unlinkPersonFromPhoto } from '../actions/unlink-person-from-photo';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PHOTO_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const PERSON_ID = 'dddddddd-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Supabase from() チェーンのモックビルダー。
 *
 * 呼び出し順 (テーブル名で判断):
 *   photo             - tree!inner JOIN で所有権確認 (select→eq→eq→single)
 *   photo_person_link - DELETE with count (delete→eq→eq, Promise)
 */
function buildSupabaseMock(options: {
  fetchResult: { data: unknown; error: unknown };
  deleteError?: unknown;
  deleteCount?: number;
}) {
  const {
    fetchResult,
    deleteError = null,
    deleteCount = 1,
  } = options;

  const mockFrom = jest.fn().mockImplementation((tableName: string) => {
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;

    if (tableName === 'photo') {
      singleFn.mockResolvedValue(fetchResult);
    } else if (tableName === 'photo_person_link') {
      // DELETE with count: delete({ count: 'exact' }).eq().eq() → Promise
      const deleteChain: Record<string, unknown> = {};
      let eqCount = 0;
      deleteChain.eq = jest.fn().mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) {
          return Promise.resolve({ error: deleteError, count: deleteCount });
        }
        return deleteChain;
      });
      chain.delete = jest.fn().mockReturnValue(deleteChain);
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な unlinkPersonFromPhoto 入力データ */
const validInput = {
  photoId: PHOTO_ID,
  personId: PERSON_ID,
};

describe('unlinkPersonFromPhoto', () => {
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

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await unlinkPersonFromPhoto(validInput);

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

    it('photoId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await unlinkPersonFromPhoto({
        photoId: 'not-a-uuid',
        personId: PERSON_ID,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await unlinkPersonFromPhoto({
        photoId: PHOTO_ID,
        personId: 'not-a-uuid',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await unlinkPersonFromPhoto({
        photoId: 'not-a-uuid',
        personId: PERSON_ID,
      });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // photo 所有権なし → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('photo 所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('写真が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: '写真が見つかりません',
        }),
      });
    });

    it('他人のツリーに属する写真の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: null, error: null },
      });

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: '写真が見つかりません',
        }),
      });
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
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
        deleteCount: 0,
      });

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DELETE エラー時に revalidatePath を呼ばないこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: { code: '42000', message: 'DB error' },
        deleteCount: 0,
      });

      await unlinkPersonFromPhoto(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE count 0 → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('DELETE count 0', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DELETE count が 0 の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 0,
      });

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'この人物は紐付けられていません',
        }),
      });
    });

    it('DELETE count 0 時に revalidatePath を呼ばないこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 0,
      });

      await unlinkPersonFromPhoto(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('正常に紐付け解除できた場合 ok: true を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 1,
      });

      const result = await unlinkPersonFromPhoto(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        deleteError: null,
        deleteCount: 1,
      });

      await unlinkPersonFromPhoto(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });
  });
});
