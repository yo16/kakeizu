/**
 * deletePhoto Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・Storage 削除・DB 削除・revalidatePath を検証する。
 * Storage 削除失敗時は DB も残す（整合性優先）。
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
import { deletePhoto } from '../actions/delete-photo';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PHOTO_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const STORAGE_KEY = `${USER_ID}/${TREE_ID}/photo.jpg`;

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * from() / storage モックを設定するヘルパー。
 *
 * 呼び出し順:
 *   from('photo') 1回目 - JOIN で所有権確認 (select→eq→eq→single)
 *   storage.from('photos').remove - Storage オブジェクト削除
 *   from('photo') 2回目 - DELETE with count (delete→eq→eq, Promise)
 */
function buildClientMock(options: {
  fetchResult: { data: unknown; error: unknown };
  storageRemoveError?: unknown;
  deleteError?: unknown;
  deleteCount?: number;
}) {
  const {
    fetchResult,
    storageRemoveError = null,
    deleteError = null,
    deleteCount = 1,
  } = options;

  const photoCallCount = { count: 0 };

  const mockFrom = jest.fn().mockImplementation(() => {
    photoCallCount.count++;
    const currentCall = photoCallCount.count;

    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    chain.delete = jest.fn().mockReturnValue(chain);

    if (currentCall === 1) {
      // JOIN 所有権確認
      singleFn.mockResolvedValue(fetchResult);
    } else if (currentCall === 2) {
      // DELETE with count
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

  const mockStorageFrom = jest.fn().mockReturnValue({
    remove: jest.fn().mockResolvedValue({ error: storageRemoveError }),
    createSignedUploadUrl: jest.fn(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom, storage: { from: mockStorageFrom } } as any);
  return { mockFrom, mockStorageFrom };
}

/** 有効な deletePhoto 入力データ */
const validInput = { photoId: PHOTO_ID };

describe('deletePhoto', () => {
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

      const result = await deletePhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await deletePhoto(validInput);

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
      const result = await deletePhoto({ photoId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('photoId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deletePhoto({ photoId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await deletePhoto({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await deletePhoto({ photoId: 'not-a-uuid' });

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

    it('写真が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildClientMock({
        fetchResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await deletePhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーに属する写真の場合 NOT_FOUND を返すこと', async () => {
      buildClientMock({
        fetchResult: { data: null, error: null },
      });

      const result = await deletePhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Storage 削除失敗 → INTERNAL_ERROR (DB は削除しない)
  // ---------------------------------------------------------------------------
  describe('Storage 削除失敗', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('Storage 削除が失敗した場合 INTERNAL_ERROR を返すこと', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: { message: 'Object not found' },
      });

      const result = await deletePhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('Storage 削除失敗時に DB DELETE を呼ばないこと', async () => {
      const { mockFrom } = buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: { message: 'Object not found' },
      });

      await deletePhoto(validInput);

      // from() は所有権確認の1回のみ (DELETE のための2回目は呼ばれない)
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // DB 削除の tree_id フィルタ検証
  // ---------------------------------------------------------------------------
  describe('DB DELETE の tree_id フィルタ', () => {
    it('DELETE クエリに tree_id フィルタが付いていること', async () => {
      setupAuthenticatedSession();

      const capturedDeleteEqArgs: Array<[string, unknown]> = [];
      const photoCallCount = { count: 0 };

      const mockFrom = jest.fn().mockImplementation(() => {
        photoCallCount.count++;
        const currentCall = photoCallCount.count;

        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;
        chain.delete = jest.fn().mockReturnValue(chain);

        if (currentCall === 1) {
          singleFn.mockResolvedValue({
            data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
            error: null,
          });
        } else if (currentCall === 2) {
          const deleteChain: Record<string, unknown> = {};
          let eqCount = 0;
          deleteChain.eq = jest.fn().mockImplementation((col: string, val: unknown) => {
            capturedDeleteEqArgs.push([col, val]);
            eqCount++;
            if (eqCount >= 2) {
              return Promise.resolve({ error: null, count: 1 });
            }
            return deleteChain;
          });
          chain.delete = jest.fn().mockReturnValue(deleteChain);
        }

        return chain;
      });

      const mockStorageFrom = jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({ error: null }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom, storage: { from: mockStorageFrom } } as any);

      await deletePhoto(validInput);

      expect(capturedDeleteEqArgs).toEqual(
        expect.arrayContaining([['tree_id', TREE_ID]])
      );
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE count 0件 → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('DELETE count 0件', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('DELETE の count が 0 の場合 INTERNAL_ERROR を返すこと', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: null,
        deleteError: null,
        deleteCount: 0,
      });

      const result = await deletePhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('DELETE エラーがある場合 INTERNAL_ERROR を返すこと', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: null,
        deleteError: { code: '42000', message: 'DB error' },
        deleteCount: 0,
      });

      const result = await deletePhoto(validInput);

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

    it('Storage 削除成功 → DB 削除 → 正常系で成功すること', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: null,
        deleteError: null,
        deleteCount: 1,
      });

      const result = await deletePhoto(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('storage.from("photos").remove が正しいオブジェクトキーで呼ばれること', async () => {
      const { mockStorageFrom } = buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: null,
        deleteError: null,
        deleteCount: 1,
      });

      await deletePhoto(validInput);

      expect(mockStorageFrom).toHaveBeenCalledWith('photos');
      const removeMock = mockStorageFrom.mock.results[0].value.remove as jest.Mock;
      expect(removeMock).toHaveBeenCalledWith([STORAGE_KEY]);
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: null,
        deleteError: null,
        deleteCount: 1,
      });

      await deletePhoto(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('Storage 削除失敗時に revalidatePath を呼ばないこと', async () => {
      buildClientMock({
        fetchResult: {
          data: { tree_id: TREE_ID, storage_object_key: STORAGE_KEY, tree: { owner_user_id: USER_ID } },
          error: null,
        },
        storageRemoveError: { message: 'Object not found' },
      });

      await deletePhoto(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
