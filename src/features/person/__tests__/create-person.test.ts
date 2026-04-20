/**
 * createPerson Server Action のユニットテスト
 *
 * 認証・バリデーション・所有権確認・プラン上限チェック・INSERT・revalidatePath を検証する。
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
import { createPerson } from '../actions/create-person';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { assertWithinLimit, PlanLimitError } from '@/lib/plan/limits';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockAssertWithinLimit = assertWithinLimit as jest.MockedFunction<typeof assertWithinLimit>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
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
 * 1回目: 所有権確認 (select→eq→eq→single)
 * 2回目: INSERT (insert→select→single)
 */
function buildFromMock(options: {
  ownershipResult: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
}) {
  const { ownershipResult, insertResult = { data: { id: PERSON_ID }, error: null } } = options;

  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    callIndex++;
    const currentCall = callIndex;
    const chain: Record<string, unknown> = {};
    const singleFn = jest.fn();
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = singleFn;
    chain.insert = jest.fn().mockReturnValue(chain);

    if (currentCall === 1) {
      // 所有権確認クエリ
      singleFn.mockResolvedValue(ownershipResult);
    } else if (currentCall === 2) {
      // INSERT クエリ
      const insertSingleFn = jest.fn().mockResolvedValue(insertResult);
      const selectChain = { single: insertSingleFn };
      chain.insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
    }

    return chain;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom };
}

/** 有効な createPerson 入力データ */
const validInput = {
  treeId: TREE_ID,
  displayName: '山田太郎',
};

describe('createPerson', () => {
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

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に assertWithinLimit を呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createPerson(validInput);

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createPerson(validInput);

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

    it('treeId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createPerson({ treeId: 'not-a-uuid', displayName: '山田太郎' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('treeId が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createPerson({ displayName: '山田太郎' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('displayName が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createPerson({ treeId: TREE_ID, displayName: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('displayName が未指定の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createPerson({ treeId: TREE_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('displayName が 201 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createPerson({ treeId: TREE_ID, displayName: 'あ'.repeat(201) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に assertWithinLimit を呼ばないこと', async () => {
      await createPerson({ treeId: TREE_ID, displayName: '' });

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await createPerson({ treeId: TREE_ID, displayName: '' });

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

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('他人のツリーの場合 FORBIDDEN を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: null },
      });

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('所有権なし時に assertWithinLimit を呼ばないこと', async () => {
      buildFromMock({
        ownershipResult: { data: null, error: { code: 'PGRST116' } },
      });

      await createPerson(validInput);

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
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
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('プランの上限に達しています', {
          resource: 'person',
          current: 10,
          limit: 10,
          planId: 'free',
        })
      );

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PLAN_LIMIT_EXCEEDED' }),
      });
    });

    it('PlanLimitError 以外がスローされた場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });
      mockAssertWithinLimit.mockRejectedValue(new Error('DB接続エラー'));

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('PLAN_LIMIT_EXCEEDED 時に INSERT を呼ばないこと', async () => {
      const { mockFrom } = buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
      });
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('上限超過', { resource: 'person', current: 10, limit: 10, planId: 'free' })
      );

      await createPerson(validInput);

      // from() は所有権確認の1回だけ呼ばれること
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // INSERT エラー → INTERNAL_ERROR
  // ---------------------------------------------------------------------------
  describe('INSERT エラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('INSERT エラー時に INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: null, error: { code: '42000', message: 'DB error' } },
      });

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('INSERT で data が null の場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: null, error: null },
      });

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('INSERT エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: null, error: { code: '42000', message: 'DB error' } },
      });

      await createPerson(validInput);

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

    it('人物作成に成功し personId を返すこと', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      const result = await createPerson(validInput);

      expect(result).toEqual({
        ok: true,
        data: { personId: PERSON_ID },
      });
    });

    it('displayName がちょうど 200 文字でも成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      const result = await createPerson({ treeId: TREE_ID, displayName: 'あ'.repeat(200) });

      expect(result).toEqual({
        ok: true,
        data: { personId: PERSON_ID },
      });
    });

    it('曖昧日付（birth.year のみ）で成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      const result = await createPerson({
        treeId: TREE_ID,
        displayName: '山田太郎',
        birth: { year: 1990 },
      });

      expect(result).toEqual({
        ok: true,
        data: { personId: PERSON_ID },
      });
    });

    it('全フィールド指定で成功すること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      const result = await createPerson({
        treeId: TREE_ID,
        displayName: '山田太郎',
        familyName: '山田',
        givenName: '太郎',
        maidenName: null,
        gender: 'male',
        birth: { year: 1990, month: 5, day: 10 },
        birthPlace: '東京都',
        deathPlace: null,
        isAlive: true,
        note: 'メモ',
      });

      expect(result).toEqual({
        ok: true,
        data: { personId: PERSON_ID },
      });
    });

    it('revalidatePath が `/dashboard/trees/${treeId}` に呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      await createPerson(validInput);

      expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/trees/${TREE_ID}`);
    });

    it('assertWithinLimit が { kind: "person", userId, treeId } で呼ばれること', async () => {
      buildFromMock({
        ownershipResult: { data: { id: TREE_ID }, error: null },
        insertResult: { data: { id: PERSON_ID }, error: null },
      });

      await createPerson(validInput);

      expect(mockAssertWithinLimit).toHaveBeenCalledWith({
        kind: 'person',
        userId: USER_ID,
        treeId: TREE_ID,
      });
    });
  });
});
