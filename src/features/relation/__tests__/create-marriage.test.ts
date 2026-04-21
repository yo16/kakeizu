/**
 * createMarriage Server Action のユニットテスト
 *
 * @/lib/auth/session の getServerSession と
 * @/lib/supabase/server の createClient をモックして、
 * バリデーション・認証・所有権確認・重複チェック・INSERT を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントのクエリビルダチェーンをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createMarriage } from '../actions/create-marriage';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

// ホイスト問題を回避: import 後にキャストして取得
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// 各テーブルごとにモックを保持できるよう、from の戻り値を制御する
const mockFrom = jest.fn();

// テスト用 UUID
const PARTNER_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PARTNER_B_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const TREE_ID      = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID      = 'cccccccc-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  });
}

/** 呼び出し順ごとの応答を設定する汎用ヘルパー */
function buildQueryChain() {
  const singleFn = jest.fn();
  const maybeSingleFn = jest.fn();
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.single = singleFn;
  chain.maybeSingle = maybeSingleFn;
  chain.insert = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  return { chain, singleFn, maybeSingleFn };
}

describe('createMarriage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue({ from: mockFrom } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 認証エラー
  // -------------------------------------------------------------------------
  describe('未ログイン', () => {
    it('セッションが null の場合 UNAUTHENTICATED を返すこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // バリデーションエラー
  // -------------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('partnerAId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: 'not-a-uuid',
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('partnerBId が UUID でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: 'not-a-uuid',
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('type が無効な値の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'invalid_type',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('status が無効な値の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'invalid_status',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('startYear が範囲外 (999) の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
        startYear: 999,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('startMonth が範囲外 (13) の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
        startMonth: 13,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が空オブジェクトの場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({});

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await createMarriage({
        partnerAId: 'bad',
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('partnerAId === partnerBId の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_A_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'partnerBId' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 片方が他人のツリー (FORBIDDEN)
  // -------------------------------------------------------------------------
  describe('他人のツリーへのアクセス', () => {
    it('パートナーAが他人のツリーに属する場合 FORBIDDEN を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          // personA のツリーID取得は成功
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          // ツリー所有権確認で失敗
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 重複婚姻関係チェック (RELATION_CONFLICT)
  // -------------------------------------------------------------------------
  describe('重複する婚姻関係', () => {
    it('A-B 方向で既存婚姻関係がある場合 RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn, maybeSingleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          // A-B 方向の重複チェック: 既存あり
          maybeSingleFn.mockResolvedValue({ data: { id: 'existing-rel-ab' } });
        } else if (callIndex === 5) {
          maybeSingleFn.mockResolvedValue({ data: null });
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });

    it('B-A 方向で既存婚姻関係がある場合 RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn, maybeSingleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          // A-B 方向: 既存なし
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 5) {
          // B-A 方向の重複チェック: 既存あり
          maybeSingleFn.mockResolvedValue({ data: { id: 'existing-rel-ba' } });
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // DB UNIQUE 制約違反 (RELATION_CONFLICT)
  // -------------------------------------------------------------------------
  describe('DB UNIQUE 制約違反', () => {
    it('INSERT 時に 23505 エラーが返る場合 RELATION_CONFLICT を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn, maybeSingleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 5) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 6) {
          // INSERT チェーン
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'RELATION_CONFLICT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------
  describe('正常系', () => {
    function setupSuccessfulMarriageQueries() {
      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn, maybeSingleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 5) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 6) {
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: { id: 'new-marriage-id' },
            error: null,
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
        }

        return chain;
      });
    }

    it('認証済み・自分のツリーの2人物で婚姻関係作成が成功し relationId を返すこと', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });

    it('start/end year+month 指定で作成成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'divorced',
        startYear: 2010,
        startMonth: 3,
        endYear: 2020,
        endMonth: 11,
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });

    it('marriage_status が divorced で作成成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'divorced',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });

    it('marriage_status が widowed で作成成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'widowed',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });

    it('type が common_law で作成成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'common_law',
        status: 'current',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });

    it('type が same_sex_partner で作成成功すること', async () => {
      setupAuthenticatedSession();
      setupSuccessfulMarriageQueries();

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'same_sex_partner',
        status: 'current',
      });

      expect(result).toEqual({
        ok: true,
        data: { relationId: 'new-marriage-id' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // INSERT 一般エラー → INTERNAL_ERROR
  // -------------------------------------------------------------------------
  describe('INSERT 一般エラー', () => {
    it('INSERT 時に 23505 以外のエラー (42501) が返る場合 INTERNAL_ERROR を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn, maybeSingleFn } = buildQueryChain();

        if (callIndex === 1) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 4) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 5) {
          maybeSingleFn.mockResolvedValue({ data: null });
        } else if (callIndex === 6) {
          // INSERT チェーン: 42501 (permission denied) エラー
          const insertSelectChain: Record<string, unknown> = {};
          insertSelectChain.single = jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'permission denied for table relation' },
          });
          chain.insert = jest.fn(() => ({ select: jest.fn(() => insertSelectChain) }));
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // パートナーBが別ツリー → NOT_FOUND
  // -------------------------------------------------------------------------
  describe('パートナーBが別ツリー', () => {
    it('パートナーAは自ツリーだがパートナーBが同一ツリーに存在しない場合 NOT_FOUND を返すこと', async () => {
      setupAuthenticatedSession();

      let callIndex = 0;
      mockFrom.mockImplementation(() => {
        callIndex++;
        const { chain, singleFn } = buildQueryChain();

        if (callIndex === 1) {
          // パートナーAのツリーID取得: 成功
          singleFn.mockResolvedValue({ data: { tree_id: TREE_ID }, error: null });
        } else if (callIndex === 2) {
          // ツリー所有権確認: 成功
          singleFn.mockResolvedValue({ data: { id: TREE_ID }, error: null });
        } else if (callIndex === 3) {
          // パートナーBが同一ツリーに存在しない
          singleFn.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
        }

        return chain;
      });

      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // バリデーションエラー: 年月の境界値
  // -------------------------------------------------------------------------
  describe('バリデーションエラー: 年月の境界値', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('endYear が 10000 の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
        endYear: 10000,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('endMonth が 0 の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
        endMonth: 0,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('startMonth が 0 の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await createMarriage({
        partnerAId: PARTNER_A_ID,
        partnerBId: PARTNER_B_ID,
        type: 'spouse',
        status: 'current',
        startMonth: 0,
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });
  });
});
