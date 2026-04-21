/**
 * createTree Server Action のユニットテスト
 *
 * 認証・バリデーション・プラン上限チェック・INSERT・revalidatePath を検証する。
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
import { createTree } from '../actions/create-tree';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { assertWithinLimit, PlanLimitError } from '@/lib/plan/limits';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockAssertWithinLimit = assertWithinLimit as jest.MockedFunction<typeof assertWithinLimit>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// テスト用 UUID
const USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const TREE_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Supabase クライアントの from モックを設定するヘルパー */
function buildFromMock(insertResult: { data: unknown; error: unknown }) {
  const singleFn = jest.fn().mockResolvedValue(insertResult);
  const selectChain = { single: singleFn };
  const insertFn = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
  const fromChain = { insert: insertFn };
  const mockFrom = jest.fn().mockReturnValue(fromChain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  return { mockFrom, insertFn, singleFn };
}

describe('createTree', () => {
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

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に assertWithinLimit を呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createTree({ title: 'テストツリー' });

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createTree({ title: 'テストツリー' });

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

    it('title が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createTree({ title: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('title が undefined の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createTree({ title: undefined });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('title が 101 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createTree({ title: 'あ'.repeat(101) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('description が 501 文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createTree({ title: 'タイトル', description: 'a'.repeat(501) });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createTree({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に assertWithinLimit を呼ばないこと', async () => {
      await createTree({ title: '' });

      expect(mockAssertWithinLimit).not.toHaveBeenCalled();
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await createTree({ title: '' });

      expect(mockCreateClient).not.toHaveBeenCalled();
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
      const planLimitInfo = {
        resource: 'tree' as const,
        current: 1,
        limit: 1,
        planId: 'free',
      };
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('プランの上限に達しています', planLimitInfo)
      );

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PLAN_LIMIT_EXCEEDED' }),
      });
    });

    it('PLAN_LIMIT_EXCEEDED 時に Supabase の INSERT を呼ばないこと', async () => {
      mockAssertWithinLimit.mockRejectedValue(
        new PlanLimitError('上限超過', { resource: 'tree', current: 1, limit: 1, planId: 'free' })
      );
      const { mockFrom } = buildFromMock({ data: null, error: null });

      await createTree({ title: 'テストツリー' });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('assertWithinLimit で PlanLimitError 以外がスローされた場合 INTERNAL_ERROR を返すこと', async () => {
      mockAssertWithinLimit.mockRejectedValue(new Error('DB接続エラー'));

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
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
      buildFromMock({ data: null, error: { code: '42000', message: 'DB error' } });

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('INSERT で data が null の場合 INTERNAL_ERROR を返すこと', async () => {
      buildFromMock({ data: null, error: null });

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });

    it('INSERT エラー時に revalidatePath を呼ばないこと', async () => {
      buildFromMock({ data: null, error: { code: '42000', message: 'DB error' } });

      await createTree({ title: 'テストツリー' });

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

    it('tree 作成に成功し treeId を返すこと', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      const result = await createTree({ title: 'テストツリー' });

      expect(result).toEqual({
        ok: true,
        data: { treeId: TREE_ID },
      });
    });

    it('description なしで作成に成功すること', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      const result = await createTree({ title: 'タイトルのみ' });

      expect(result).toEqual({
        ok: true,
        data: { treeId: TREE_ID },
      });
    });

    it('description ありで作成に成功すること', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      const result = await createTree({ title: 'タイトル', description: '説明文' });

      expect(result).toEqual({
        ok: true,
        data: { treeId: TREE_ID },
      });
    });

    it('title がちょうど 100 文字でも成功すること', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      const result = await createTree({ title: 'あ'.repeat(100) });

      expect(result).toEqual({
        ok: true,
        data: { treeId: TREE_ID },
      });
    });

    it('revalidatePath("/dashboard") が呼ばれること', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      await createTree({ title: 'テストツリー' });

      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
    });

    it('assertWithinLimit が { kind: "tree", userId } で呼ばれること', async () => {
      buildFromMock({ data: { id: TREE_ID }, error: null });

      await createTree({ title: 'テストツリー' });

      expect(mockAssertWithinLimit).toHaveBeenCalledWith({
        kind: 'tree',
        userId: USER_ID,
      });
    });
  });
});
