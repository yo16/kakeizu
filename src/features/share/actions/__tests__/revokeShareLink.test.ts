/**
 * revokeShareLink Server Action のユニットテスト
 *
 * 認証・バリデーション・UPDATE (RLS 違反含む) を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getServerSession をモック
jest.mock('@/lib/auth/session', () => ({
  getServerSession: jest.fn(),
}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { revokeShareLink } from '../revokeShareLink';
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// テスト用 UUID
const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const LINK_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';

/** 認証済みセッションを返すヘルパー */
function setupAuthenticatedSession(userId = USER_ID) {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId },
    session: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Supabase の update チェーンをモックするヘルパー。
 * .from().update().eq().select() をシミュレートする。
 */
function buildUpdateMock(updateResult: { data: unknown; error: unknown }) {
  const selectFn = jest.fn().mockResolvedValue(updateResult);
  const eqFn = jest.fn().mockReturnValue({ select: selectFn });
  const updateFn = jest.fn().mockReturnValue({ eq: eqFn });
  const fromFn = jest.fn().mockReturnValue({ update: updateFn });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({ from: fromFn } as any);
  return { fromFn, updateFn, eqFn, selectFn };
}

describe('revokeShareLink', () => {
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

      const result = await revokeShareLink({ linkId: LINK_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      });
    });

    it('未ログイン時に Supabase クライアントを呼ばないこと', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await revokeShareLink({ linkId: LINK_ID });

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

    it('linkId が UUID 形式でない場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await revokeShareLink({ linkId: 'not-a-uuid' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('linkId が空文字の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await revokeShareLink({ linkId: '' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('linkId が undefined の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await revokeShareLink({ linkId: undefined });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('入力が null の場合 VALIDATION_ERROR を返すこと', async () => {
      const result = await revokeShareLink(null);

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    });

    it('バリデーションエラー時に Supabase クライアントを呼ばないこと', async () => {
      await revokeShareLink({ linkId: 'invalid' });

      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('成功時に ok: true を返すこと', async () => {
      buildUpdateMock({ data: [{ id: LINK_ID }], error: null });

      const result = await revokeShareLink({ linkId: LINK_ID });

      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('update が is_enabled=false で呼ばれること', async () => {
      const { updateFn } = buildUpdateMock({ data: [{ id: LINK_ID }], error: null });

      await revokeShareLink({ linkId: LINK_ID });

      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ is_enabled: false })
      );
    });

    it('update が revoked_at を ISO 文字列で含むこと', async () => {
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      const { updateFn } = buildUpdateMock({ data: [{ id: LINK_ID }], error: null });

      await revokeShareLink({ linkId: LINK_ID });

      const [updateArg] = updateFn.mock.calls[0];
      expect(updateArg.revoked_at).toMatch(isoPattern);
    });

    it('eq が linkId で呼ばれること', async () => {
      const { eqFn } = buildUpdateMock({ data: [{ id: LINK_ID }], error: null });

      await revokeShareLink({ linkId: LINK_ID });

      expect(eqFn).toHaveBeenCalledWith('id', LINK_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // RLS 違反 / 存在しない → NOT_FOUND
  // ---------------------------------------------------------------------------
  describe('RLS 違反 / 存在しないリンク', () => {
    beforeEach(() => {
      setupAuthenticatedSession();
    });

    it('UPDATE 結果が空配列の場合 NOT_FOUND を返すこと', async () => {
      buildUpdateMock({ data: [], error: null });

      const result = await revokeShareLink({ linkId: LINK_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });

    it('UPDATE 結果が null の場合 NOT_FOUND を返すこと', async () => {
      buildUpdateMock({ data: null, error: null });

      const result = await revokeShareLink({ linkId: LINK_ID });

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

    it('UPDATE でエラーが発生した場合 INTERNAL_ERROR を返すこと', async () => {
      buildUpdateMock({ data: null, error: { code: '42000', message: 'DB error' } });

      const result = await revokeShareLink({ linkId: LINK_ID });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      });
    });
  });
});
