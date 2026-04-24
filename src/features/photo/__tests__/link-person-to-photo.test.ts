/**
 * linkPersonToPhoto Server Action のユニットテスト
 *
 * 認証・バリデーション・ツリー所有権確認・person クロスツリー確認・
 * photo クロスツリー確認・INSERT（重複/その他エラー）・revalidatePath を検証する。
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
import { linkPersonToPhoto } from '../actions/link-person-to-photo';
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
 *   tree              - ツリー所有権確認 (select→eq→eq→single)
 *   person            - person クロスツリー確認 (select→eq→eq→single)
 *   photo             - photo クロスツリー確認 (select→eq→eq→single)
 *   photo_person_link - INSERT (insert)
 */
function buildSupabaseMock(options: {
  treeResult: { data: unknown; error: unknown };
  personResult?: { data: unknown; error: unknown };
  photoResult?: { data: unknown; error: unknown };
  linkInsertError?: unknown;
}) {
  const {
    treeResult,
    personResult = { data: { id: PERSON_ID }, error: null },
    photoResult = { data: { id: PHOTO_ID }, error: null },
    linkInsertError = null,
  } = options;

  const mockFrom = jest.fn().mockImplementation((tableName: string) => {
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;

    if (tableName === 'tree') {
      singleFn.mockResolvedValue(treeResult);
    } else if (tableName === 'person') {
      singleFn.mockResolvedValue(personResult);
    } else if (tableName === 'photo') {
      singleFn.mockResolvedValue(photoResult);
    } else if (tableName === 'photo_person_link') {
      chain.insert = jest.fn().mockResolvedValue({ error: linkInsertError });
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な linkPersonToPhoto 入力データ */
const validInput = {
  photoId: PHOTO_ID,
  personId: PERSON_ID,
  treeId: TREE_ID,
};

describe('linkPersonToPhoto', () => {
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

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await linkPersonToPhoto(validInput);

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
      const result = await linkPersonToPhoto({
        photoId: 'not-a-uuid',
        personId: PERSON_ID,
        treeId: TREE_ID,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('personId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await linkPersonToPhoto({
        photoId: PHOTO_ID,
        personId: 'not-a-uuid',
        treeId: TREE_ID,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await linkPersonToPhoto({
        photoId: PHOTO_ID,
        personId: PERSON_ID,
        treeId: 'not-a-uuid',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await linkPersonToPhoto({
        photoId: 'not-a-uuid',
        personId: PERSON_ID,
        treeId: TREE_ID,
      });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // ツリー所有権なし → FORBIDDEN
  // ---------------------------------------------------------------------------
  describe('ツリー所有権なし', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('ツリーが存在しない場合 FORBIDDEN を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'このツリーへのアクセス権がありません',
        }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: null, error: null },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'このツリーへのアクセス権がありません',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // person が別ツリー所属 → FORBIDDEN
  // ---------------------------------------------------------------------------
  describe('person が別ツリー所属', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('person が同ツリーに存在しない場合 FORBIDDEN を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: '他ツリーの人物は指定できません',
        }),
      });
    });

    it('person が別ツリーに属する場合 FORBIDDEN を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: null, error: null },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: '他ツリーの人物は指定できません',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // photo が別ツリー所属 or 存在しない → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('photo が別ツリー所属 or 存在しない', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('photo が存在しない場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: null, error: { code: 'PGRST116' } },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: '写真が見つかりません',
        }),
      });
    });

    it('photo が別ツリーに属する場合 NOT_FOUND を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: null, error: null },
      });

      const result = await linkPersonToPhoto(validInput);

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
  // INSERT 23505 (重複) → VALIDATION_ERROR
  // ---------------------------------------------------------------------------
  describe('INSERT 23505 重複エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('INSERT で 23505 エラーの場合 VALIDATION_ERROR を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: { id: PHOTO_ID }, error: null },
        linkInsertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'この人物はすでに紐付けられています',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // INSERT その他エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('INSERT その他エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('INSERT でその他エラーの場合 INTERNAL_ERROR を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: { id: PHOTO_ID }, error: null },
        linkInsertError: { code: '42000', message: 'DB error' },
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: '人物の紐付けに失敗しました',
        }),
      });
    });

    it('INSERT エラー時に revalidatePath を呼ばないこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: { id: PHOTO_ID }, error: null },
        linkInsertError: { code: '42000', message: 'DB error' },
      });

      await linkPersonToPhoto(validInput);

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

    it('正常に紐付けられた場合 ok: true を返すこと', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: { id: PHOTO_ID }, error: null },
        linkInsertError: null,
      });

      const result = await linkPersonToPhoto(validInput);

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildSupabaseMock({
        treeResult: { data: { id: TREE_ID }, error: null },
        personResult: { data: { id: PERSON_ID }, error: null },
        photoResult: { data: { id: PHOTO_ID }, error: null },
        linkInsertError: null,
      });

      await linkPersonToPhoto(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });
  });
});
