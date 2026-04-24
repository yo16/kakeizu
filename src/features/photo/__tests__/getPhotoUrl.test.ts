/**
 * getPhotoUrl ユーティリティの単体テスト
 *
 * `@/lib/supabase/server` の createClient を jest.mock() で差し替え、
 * storage.from().createSignedUrl() の呼び出し引数・返り値を検証する。
 */

// server-only モジュールをモック（Next.js サーバー専用モジュールを無効化）
jest.mock('server-only', () => ({}));

// Supabase クライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { getPhotoUrl } from '../utils/getPhotoUrl';
import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

const STORAGE_PATH = 'user-id/tree-id/photo.jpg';
const SIGNED_URL = 'https://example.supabase.co/storage/v1/object/sign/photos/user-id/tree-id/photo.jpg?token=abc';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * createClient モックをセットアップする。
 * createSignedUrl の返り値を引数で制御する。
 */
function setupCreateClientMock(signedUrlResult: {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
}) {
  const mockCreateSignedUrl = jest.fn().mockResolvedValue(signedUrlResult);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateClient.mockResolvedValue({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  } as any);

  return { mockCreateSignedUrl };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('getPhotoUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // テスト #1: プリセットなし → transform なしで呼ばれること
  // -------------------------------------------------------------------------
  describe('プリセット未指定', () => {
    it('createSignedUrl が (path, 3600, undefined) で呼ばれ、signedUrl を返すこと', async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      const result = await getPhotoUrl(STORAGE_PATH);

      expect(result).toBe(SIGNED_URL);
      expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 3600, undefined);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #2: preset: 'thumbnail' → 96x96 cover
  // -------------------------------------------------------------------------
  describe("preset: 'thumbnail'", () => {
    it("createSignedUrl が 96x96 cover の transform オプションで呼ばれること", async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      const result = await getPhotoUrl(STORAGE_PATH, { preset: 'thumbnail' });

      expect(result).toBe(SIGNED_URL);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 3600, {
        transform: { width: 96, height: 96, resize: 'cover' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // テスト #3: preset: 'detail' → 480x480 contain
  // -------------------------------------------------------------------------
  describe("preset: 'detail'", () => {
    it("createSignedUrl が 480x480 contain の transform オプションで呼ばれること", async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      const result = await getPhotoUrl(STORAGE_PATH, { preset: 'detail' });

      expect(result).toBe(SIGNED_URL);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 3600, {
        transform: { width: 480, height: 480, resize: 'contain' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // テスト #4: preset: 'full' → 1280x1280 contain
  // -------------------------------------------------------------------------
  describe("preset: 'full'", () => {
    it("createSignedUrl が 1280x1280 contain の transform オプションで呼ばれること", async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      const result = await getPhotoUrl(STORAGE_PATH, { preset: 'full' });

      expect(result).toBe(SIGNED_URL);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 3600, {
        transform: { width: 1280, height: 1280, resize: 'contain' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // テスト #5: expiresIn 指定
  // -------------------------------------------------------------------------
  describe('expiresIn 指定', () => {
    it('expiresIn: 7200 を指定すると 7200 で createSignedUrl が呼ばれること', async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      await getPhotoUrl(STORAGE_PATH, { expiresIn: 7200 });

      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 7200, undefined);
    });

    it('expiresIn と preset を同時に指定できること', async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      await getPhotoUrl(STORAGE_PATH, { preset: 'thumbnail', expiresIn: 1800 });

      expect(mockCreateSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 1800, {
        transform: { width: 96, height: 96, resize: 'cover' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // テスト #6: error が返った場合 → Error を throw
  // -------------------------------------------------------------------------
  describe('error が返った場合', () => {
    it('Error を throw し、メッセージに storagePath とエラー内容が含まれること', async () => {
      setupCreateClientMock({
        data: null,
        error: { message: 'Storage access denied' },
      });

      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toThrow(STORAGE_PATH);
      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toThrow('Storage access denied');
    });

    it('throw された Error が Error インスタンスであること', async () => {
      setupCreateClientMock({
        data: null,
        error: { message: 'Some storage error' },
      });

      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toBeInstanceOf(Error);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #7: data が null の場合 → Error を throw
  // -------------------------------------------------------------------------
  describe('data が null の場合', () => {
    it('error も null・data も null のとき Error を throw すること', async () => {
      setupCreateClientMock({
        data: null,
        error: null,
      });

      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toThrow();
    });

    it('エラーメッセージに storagePath が含まれること', async () => {
      setupCreateClientMock({
        data: null,
        error: null,
      });

      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toThrow(STORAGE_PATH);
    });

    it('エラーメッセージに "no data" が含まれること', async () => {
      setupCreateClientMock({
        data: null,
        error: null,
      });

      await expect(getPhotoUrl(STORAGE_PATH)).rejects.toThrow('no data');
    });
  });

  // -------------------------------------------------------------------------
  // テスト #8: デフォルト値の確認
  // -------------------------------------------------------------------------
  describe('デフォルト値', () => {
    it('options を省略した場合に expiresIn が 3600 になること', async () => {
      const { mockCreateSignedUrl } = setupCreateClientMock({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });

      await getPhotoUrl(STORAGE_PATH);

      const [, expiresIn] = mockCreateSignedUrl.mock.calls[0] as [string, number, unknown];
      expect(expiresIn).toBe(3600);
    });
  });
});
