/**
 * registerPhotoAfterUpload Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・storageObjectKey プレフィックス検証・
 * personIds クロスツリー検証・プラン上限チェック・INSERT・
 * photo_person_link INSERT・ロールバック・revalidatePath を検証する。
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

// assertWithinLimit と PlanLimitError をモック
jest.mock('@/lib/plan/limits', () => ({
  assertWithinLimit: jest.fn(),
  PlanLimitError: class PlanLimitError extends Error {
    code = 'PLAN_LIMIT_EXCEEDED' as const;
    info: unknown;
    constructor(message: string, info: unknown) {
      super(message);
      this.name = 'PlanLimitError';
      this.info = info;
    }
  },
}));

import { revalidatePath } from 'next/cache';
import { registerPhotoAfterUpload } from '../actions/create-photo';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { assertWithinLimit, PlanLimitError } from '@/lib/plan/limits';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockAssertWithinLimit = assertWithinLimit as jest.MockedFunction<typeof assertWithinLimit>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID   = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const PHOTO_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const PERSON_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_PERSON_ID = 'eeeeeeee-0000-0000-0000-000000000001';

const STORAGE_OBJECT_KEY = `${USER_ID}/${TREE_ID}/photo.jpg`;

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
 * 呼び出し順:
 *   1回目 - ツリー所有権確認 (tree テーブル, select→eq→eq→single)
 *   2回目 - personIds クロスツリー確認 (person テーブル, select→eq→in) ※personIds がある場合
 *   3回目 (or 2回目) - photo INSERT (photo テーブル, insert→select→single)
 *   4回目 (or 3回目) - photo_person_link INSERT ※personIds がある場合
 *   ロールバック時 - photo DELETE ※link INSERT 失敗時
 */
function buildSupabaseMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  personsResult?: { data: unknown; error: unknown };
  photoInsertResult?: { data: unknown; error: unknown };
  linkInsertError?: unknown;
  rollbackDeleteError?: unknown;
}) {
  const {
    ownershipResult,
    personsResult = { data: [{ id: PERSON_ID }], error: null },
    photoInsertResult = { data: { id: PHOTO_ID }, error: null },
    linkInsertError = null,
    rollbackDeleteError = null,
  } = options;

  const calls: Array<string> = [];

  const mockFrom = jest.fn().mockImplementation((tableName: string) => {
    calls.push(tableName);
    const callIndex = calls.length;

    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn().mockResolvedValue(personsResult);
    chain.single = singleFn;
    chain.insert = jest.fn().mockReturnValue(chain);
    chain.delete = jest.fn().mockReturnValue(chain);

    if (tableName === 'tree' || (tableName === 'photo' && callIndex === 1)) {
      // 所有権確認
      singleFn.mockResolvedValue(ownershipResult);
    } else if (tableName === 'person') {
      // personIds クロスツリー確認は in() で終わる (既に設定済み)
    } else if (tableName === 'photo') {
      if (calls.filter((t) => t === 'photo').length === 1) {
        // photo INSERT
        const insertSingleFn = jest.fn().mockResolvedValue(photoInsertResult);
        const selectChain = { single: insertSingleFn };
        chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
      } else {
        // photo DELETE (ロールバック)
        const deleteChain: Record<string, unknown> = {};
        let eqCount = 0;
        deleteChain.eq = jest.fn().mockImplementation(() => {
          eqCount++;
          if (eqCount >= 2) {
            return Promise.resolve({ error: rollbackDeleteError });
          }
          return deleteChain;
        });
        chain.delete = jest.fn().mockReturnValue(deleteChain);
      }
    } else if (tableName === 'photo_person_link') {
      // link INSERT: エラーを返す
      chain.insert = jest.fn().mockResolvedValue({ error: linkInsertError });
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom, calls };
}

/** 有効な registerPhotoAfterUpload 入力データ */
const validInput = {
  treeId: TREE_ID,
  storageObjectKey: STORAGE_OBJECT_KEY,
};

describe('registerPhotoAfterUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockAssertWithinLimit.mockResolvedValue(undefined);
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

      const result = await registerPhotoAfterUpload(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await registerPhotoAfterUpload(validInput);

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

    it('storageObjectKey が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: '',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('storageObjectKey が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await registerPhotoAfterUpload({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await registerPhotoAfterUpload({
        treeId: 'not-a-uuid',
        storageObjectKey: STORAGE_OBJECT_KEY,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personIds に UUID でない文字列が含まれる場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: ['not-a-uuid'],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await registerPhotoAfterUpload({ treeId: TREE_ID });

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
      buildSupabaseMock({
        ownershipResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await registerPhotoAfterUpload(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await registerPhotoAfterUpload(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // storageObjectKey プレフィックス不正 → VALIDATION_ERROR
  // ---------------------------------------------------------------------------
  describe('storageObjectKey プレフィックス検証', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('プレフィックスが不正な storageObjectKey は VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: 'other-user/other-tree/photo.jpg',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('userId のみ一致してtreeId が異なる場合 VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: `${USER_ID}/other-tree-id/photo.jpg`,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
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
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: null, error: { code: '42P01', message: 'relation "person" does not exist' } },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
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
        ownershipResult: { data: { id: TREE_ID }, error: null },
        // personIds に2件指定したが DB には1件しか存在しない
        personsResult: { data: [{ id: PERSON_ID }], error: null },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID, OTHER_PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personsInTree が null の場合 VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: null, error: null },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // プラン上限超過 → PLAN_LIMIT_EXCEEDED
  // ---------------------------------------------------------------------------
  describe('プラン上限超過', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('PlanLimitError がスローされた場合 PLAN_LIMIT_EXCEEDED を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [{ id: PERSON_ID }], error: null },
      });
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('プランの上限に達しています', {
          resource: 'photo',
          current: 10,
          limit: 10,
          planId: 'free',
        })
      );

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PLAN_LIMIT_EXCEEDED' }),
      });
    });

    it('personIds に 3 件指定した場合 assertWithinLimit が 3 回呼ばれ各 personId が渡されること', async () => {
      const PERSON_ID_2 = 'ffffffff-0000-0000-0000-000000000002';
      const PERSON_ID_3 = 'ffffffff-0000-0000-0000-000000000003';

      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: {
          data: [{ id: PERSON_ID }, { id: PERSON_ID_2 }, { id: PERSON_ID_3 }],
          error: null,
        },
      });

      await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID, PERSON_ID_2, PERSON_ID_3],
      });

      expect(mockAssertWithinLimit).toHaveBeenCalledTimes(3);
      expect(mockAssertWithinLimit).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ personId: PERSON_ID })
      );
      expect(mockAssertWithinLimit).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ personId: PERSON_ID_2 })
      );
      expect(mockAssertWithinLimit).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ personId: PERSON_ID_3 })
      );
    });

    it('personIds なしの場合は assertWithinLimit を呼ばないこと', async () => {
      // photo INSERT が必要なのでモックを設定
      const insertSingleFn = jest.fn().mockResolvedValue({ data: { id: PHOTO_ID }, error: null });
      const selectChain = { single: insertSingleFn };
      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'tree') {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (tableName === 'photo') {
          chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await registerPhotoAfterUpload(validInput);

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // photo_person_link INSERT 失敗 → ロールバック
  // ---------------------------------------------------------------------------
  describe('photo_person_link INSERT 失敗時のロールバック', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('photo_person_link INSERT 失敗時に INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [{ id: PERSON_ID }], error: null },
        linkInsertError: { code: '23503', message: 'FK violation' },
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('photo_person_link INSERT 失敗時に photo DELETE (ロールバック) が呼ばれること', async () => {
      const insertSingleFn = jest.fn().mockResolvedValue({ data: { id: PHOTO_ID }, error: null });
      const selectChain = { single: insertSingleFn };

      // mock.calls は mockImplementation 内では未更新のため、外部カウンターで呼び出し回数を管理する
      let photoCallCount = 0;

      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'tree') {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (tableName === 'person') {
          chain.in = jest.fn().mockResolvedValue({ data: [{ id: PERSON_ID }], error: null });
        } else if (tableName === 'photo') {
          const currentCount = photoCallCount;
          photoCallCount++;
          if (currentCount === 0) {
            // INSERT (1回目)
            chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
          } else {
            // DELETE (ロールバック, 2回目以降)
            const deleteChain: Record<string, unknown> = {};
            let eqCount = 0;
            deleteChain.eq = jest.fn().mockImplementation(() => {
              eqCount++;
              if (eqCount >= 2) {
                return Promise.resolve({ error: null });
              }
              return deleteChain;
            });
            chain.delete = jest.fn().mockReturnValue(deleteChain);
          }
        } else if (tableName === 'photo_person_link') {
          chain.insert = jest.fn().mockResolvedValue({ error: { code: '23503' } });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

      // photo DELETE が呼ばれたかチェック (from('photo') が2回以上呼ばれること)
      const photoFromCalls = mockFrom.mock.calls.filter((c) => c[0] === 'photo');
      expect(photoFromCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('photo_person_link INSERT 失敗時に revalidatePath を呼ばないこと', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [{ id: PERSON_ID }], error: null },
        linkInsertError: { code: '23503', message: 'FK violation' },
      });

      await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

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

    it('personIds なしで写真登録に成功し photoId を返すこと', async () => {
      const insertSingleFn = jest.fn().mockResolvedValue({ data: { id: PHOTO_ID }, error: null });
      const selectChain = { single: insertSingleFn };
      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'tree') {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (tableName === 'photo') {
          chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      const result = await registerPhotoAfterUpload(validInput);

      expect(result).toEqual({
        ok: true,
        data: { photoId: PHOTO_ID },
      });
    });

    it('personIds ありで写真登録と人物リンクに成功すること', async () => {
      buildSupabaseMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        personsResult: { data: [{ id: PERSON_ID }], error: null },
        linkInsertError: null,
      });

      const result = await registerPhotoAfterUpload({
        treeId: TREE_ID,
        storageObjectKey: STORAGE_OBJECT_KEY,
        personIds: [PERSON_ID],
      });

      expect(result).toEqual({
        ok: true,
        data: { photoId: PHOTO_ID },
      });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      const insertSingleFn = jest.fn().mockResolvedValue({ data: { id: PHOTO_ID }, error: null });
      const selectChain = { single: insertSingleFn };
      const mockFrom = jest.fn().mockImplementation((tableName: string) => {
        const chain: Record<string, unknown> = {};
        const singleFn = jest.fn();
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = singleFn;

        if (tableName === 'tree') {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (tableName === 'photo') {
          chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
        }

        return chain;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateClient.mockResolvedValue({ from: mockFrom } as any);

      await registerPhotoAfterUpload(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });
  });
});
