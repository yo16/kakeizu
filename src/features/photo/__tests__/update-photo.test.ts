/**
 * updatePhotoMeta Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・UPDATE・personIds クロスツリー検証・
 * photo_person_link 洗い替え・revalidatePath を検証する。
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
import { updatePhotoMeta } from '../actions/update-photo';
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
const OTHER_PERSON_ID = 'eeeeeeee-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * 完全なモックを手動で組み立てるビルダー。
 *
 * 呼び出し順 (テーブル名で判断):
 *   photo (1回目) - JOIN で所有権確認 (select→eq→eq→single)
 *   photo (2回目) - UPDATE with count (update→eq→eq, Promise)
 *   person       - personIds クロスツリー確認 (select→eq→in)
 *   photo_person_link (1回目) - DELETE 既存リンク (delete→eq, Promise)
 *   photo_person_link (2回目) - INSERT 新規リンク (insert, Promise)
 */
function buildSupabaseMock(options: {
  fetchResult: { data: unknown; error: unknown };
  updateError?: unknown;
  updateCount?: number;
  personsResult?: { data: unknown; error: unknown };
  deleteLinksError?: unknown;
  insertLinksError?: unknown;
}) {
  const {
    fetchResult,
    updateError = null,
    updateCount = 1,
    personsResult = { data: [{ id: PERSON_ID }], error: null },
    deleteLinksError = null,
    insertLinksError = null,
  } = options;

  const photoCallCount = { count: 0 };
  const linkCallCount = { count: 0 };

  const mockFrom = jest.fn().mockImplementation((tableName: string) => {
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    chain.in = jest.fn().mockResolvedValue(personsResult);
    chain.insert = jest.fn().mockResolvedValue({ error: insertLinksError });
    chain.delete = jest.fn().mockReturnValue(chain);

    if (tableName === 'photo') {
      photoCallCount.count++;
      const currentPhotoCall = photoCallCount.count;

      if (currentPhotoCall === 1) {
        // JOIN 所有権確認
        singleFn.mockResolvedValue(fetchResult);
      } else if (currentPhotoCall === 2) {
        // UPDATE with count
        const updateChain: Record<string, unknown> = {};
        let updateEqCount = 0;
        const updateEqFn = jest.fn().mockImplementation(() => {
          updateEqCount++;
          if (updateEqCount >= 2) {
            return Promise.resolve({ error: updateError, count: updateCount });
          }
          return updateChain;
        });
        updateChain.eq = updateEqFn;
        chain.update = jest.fn().mockReturnValue(updateChain);
      }
    } else if (tableName === 'person') {
      // personIds クロスツリー確認
      chain.in = jest.fn().mockResolvedValue(personsResult);
    } else if (tableName === 'photo_person_link') {
      linkCallCount.count++;
      const currentLinkCall = linkCallCount.count;

      if (currentLinkCall === 1) {
        // DELETE 既存リンク: eq() が Promise を返す
        const deleteLinkChain: Record<string, unknown> = {};
        deleteLinkChain.eq = jest.fn().mockResolvedValue({ error: deleteLinksError });
        chain.delete = jest.fn().mockReturnValue(deleteLinkChain);
      } else {
        // INSERT 新規リンク
        chain.insert = jest.fn().mockResolvedValue({ error: insertLinksError });
      }
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な updatePhotoMeta 入力データ (caption のみ更新) */
const validInput = {
  photoId: PHOTO_ID,
  caption: '更新後キャプション',
};

describe('updatePhotoMeta', () => {
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

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await updatePhotoMeta(validInput);

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
      const result = await updatePhotoMeta({ photoId: 'not-a-uuid', caption: 'test' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('photoId のみ指定で更新フィールドがない場合 VALIDATION_ERROR を返すこと (refine)', async () => {
      const result = await updatePhotoMeta({ photoId: PHOTO_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await updatePhotoMeta({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await updatePhotoMeta({ photoId: PHOTO_ID });

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
      buildSupabaseMock({
        fetchResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('他人のツリーに属する写真の場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: null, error: null },
      });

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // personIds クロスツリー確認 DB エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('personIds クロスツリー確認 DB エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('person クロスツリー確認クエリが DB エラーを返した場合 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
        personsResult: { data: null, error: { code: '42P01', message: 'relation "person" does not exist' } },
      });

      const result = await updatePhotoMeta({
        photoId: PHOTO_ID,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // personIds クロスツリー混入 → VALIDATION_ERROR
  // ---------------------------------------------------------------------------
  describe('personIds クロスツリー検証', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('他ツリーの person が含まれる場合 VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
        // 2件指定したが DB には1件しか存在しない
        personsResult: { data: [{ id: PERSON_ID }], error: null },
      });

      const result = await updatePhotoMeta({
        photoId: PHOTO_ID,
        personIds: [PERSON_ID, OTHER_PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personsInTree が null の場合 VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
        personsResult: { data: null, error: null },
      });

      const result = await updatePhotoMeta({
        photoId: PHOTO_ID,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE の tree_id フィルタ検証
  // ---------------------------------------------------------------------------
  describe('UPDATE クエリの tree_id フィルタ', () => {
    it('UPDATE クエリに tree_id フィルタが付いていること', async () => {
      setupAuthenticatedSession();

      const capturedUpdateEqArgs: Array<[string, unknown]> = [];
      const photoCallCount = { count: 0 };

      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'photo') {
          photoCallCount.count++;

          if (photoCallCount.count === 1) {
            singleFn.mockResolvedValue({
              data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } },
              error: null,
            });
          } else {
            const updateChain: Record<string, unknown> = {};
            let eqCount = 0;
            updateChain.eq = jest.fn().mockImplementation((col: string, val: unknown) => {
              capturedUpdateEqArgs.push([col, val]);
              eqCount++;
              if (eqCount >= 2) {
                return Promise.resolve({ error: null, count: 1 });
              }
              return updateChain;
            });
            chain.update = jest.fn().mockReturnValue(updateChain);
          }
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updatePhotoMeta(validInput);

      expect(capturedUpdateEqArgs).toEqual(
        expect.arrayContaining([['tree_id', TREE_ID]])
      );
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE count 0 件 → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('UPDATE count 0件', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UPDATE の count が 0 の場合 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: null,
        updateCount: 0,
      });

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('UPDATE エラーがある場合 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: { code: '42000', message: 'DB error' },
        updateCount: 0,
      });

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // photo_person_link 洗い替え
  // ---------------------------------------------------------------------------
  describe('photo_person_link 洗い替え', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('personIds を指定した場合に既存リンク削除→新規挿入が行われること', async () => {
      const linkOperations: string[] = [];
      const photoCallCount = { count: 0 };
      const linkCallCount = { count: 0 };

      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'photo') {
          photoCallCount.count++;
          if (photoCallCount.count === 1) {
            singleFn.mockResolvedValue({
              data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } },
              error: null,
            });
          } else {
            const updateChain: Record<string, unknown> = {};
            let eqCount = 0;
            updateChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                return Promise.resolve({ error: null, count: 1 });
              }
              return updateChain;
            });
            chain.update = jest.fn().mockReturnValue(updateChain);
          }
        } else if (tableName === 'person') {
          chain.in = jest.fn().mockResolvedValue({ data: [{ id: PERSON_ID }], error: null });
        } else if (tableName === 'photo_person_link') {
          linkCallCount.count++;
          if (linkCallCount.count === 1) {
            linkOperations.push('delete');
            const deleteLinkChain: Record<string, unknown> = {};
            deleteLinkChain.eq = jest.fn().mockResolvedValue({ error: null });
            chain.delete = jest.fn().mockReturnValue(deleteLinkChain);
          } else {
            linkOperations.push('insert');
            chain.insert = jest.fn().mockResolvedValue({ error: null });
          }
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updatePhotoMeta({
        photoId: PHOTO_ID,
        caption: 'test',
        personIds: [PERSON_ID],
      });

      expect(linkOperations).toEqual(['delete', 'insert']);
    });

    it('personIds が空配列の場合は既存リンクを削除して挿入しないこと', async () => {
      const linkOperations: string[] = [];
      const photoCallCount = { count: 0 };
      const linkCallCount = { count: 0 };

      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'photo') {
          photoCallCount.count++;
          if (photoCallCount.count === 1) {
            singleFn.mockResolvedValue({
              data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } },
              error: null,
            });
          } else {
            const updateChain: Record<string, unknown> = {};
            let eqCount = 0;
            updateChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                return Promise.resolve({ error: null, count: 1 });
              }
              return updateChain;
            });
            chain.update = jest.fn().mockReturnValue(updateChain);
          }
        } else if (tableName === 'photo_person_link') {
          linkCallCount.count++;
          if (linkCallCount.count === 1) {
            linkOperations.push('delete');
            const deleteLinkChain: Record<string, unknown> = {};
            deleteLinkChain.eq = jest.fn().mockResolvedValue({ error: null });
            chain.delete = jest.fn().mockReturnValue(deleteLinkChain);
          } else {
            linkOperations.push('insert');
            chain.insert = jest.fn().mockResolvedValue({ error: null });
          }
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await updatePhotoMeta({
        photoId: PHOTO_ID,
        caption: 'test',
        personIds: [],
      });

      // DELETE のみ、INSERT は行われないこと
      expect(linkOperations).toEqual(['delete']);
    });

    it('delete links エラー時に INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
        personsResult: { data: [{ id: PERSON_ID }], error: null },
        deleteLinksError: { code: '42000', message: 'DB error' },
      });

      const result = await updatePhotoMeta({
        photoId: PHOTO_ID,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('insert links エラー時に INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
        personsResult: { data: [{ id: PERSON_ID }], error: null },
        insertLinksError: { code: '23503', message: 'FK violation' },
      });

      const result = await updatePhotoMeta({
        photoId: PHOTO_ID,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // personIds 未指定時の photo_person_link アクセス抑制
  // ---------------------------------------------------------------------------
  describe('personIds 未指定時の photo_person_link アクセス抑制', () => {
    it('personIds を省略した場合 photo_person_link テーブルへアクセスしないこと', async () => {
      setupAuthenticatedSession();

      const { mockFrom } = buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
      });

      await updatePhotoMeta({
        photoId: PHOTO_ID,
        caption: 'new',
      });

      const calledTables = mockFrom.mock.calls.map((call) => call[0] as string);
      expect(calledTables).not.toContain('photo_person_link');
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('caption 更新に成功すること', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
      });

      const result = await updatePhotoMeta(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateCount: 1,
      });

      await updatePhotoMeta(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('UPDATE エラー時に revalidatePath を呼ばないこと', async () => {
      buildSupabaseMock({
        fetchResult: { data: { tree_id: TREE_ID, tree: { owner_user_id: USER_ID } }, error: null },
        updateError: { code: '42000' },
        updateCount: 0,
      });

      await updatePhotoMeta(validInput);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
