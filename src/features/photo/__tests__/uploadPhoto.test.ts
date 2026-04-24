/**
 * uploadPhoto ユーティリティの単体テスト
 *
 * グローバル fetch をモックし、リトライ待機には jest.useFakeTimers() を使用する。
 */

import { uploadPhoto } from '../utils/uploadPhoto';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** fetch モックの Response 相当オブジェクトを作成するヘルパー */
function makeResponse(ok: boolean, status = 200, statusText = 'OK') {
  return { ok, status, statusText } as Response;
}

/** jest.fn() を global.fetch にセットして返す */
function setupFetchMock() {
  const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  global.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

const SIGNED_URL = 'https://example.com/signed-upload?token=abc';
const OBJECT_KEY = 'user-id/tree-id/photo.jpg';
const BLOB = new Blob(['dummy image data'], { type: 'image/jpeg' });

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('uploadPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // テスト #1: 1回目成功
  // -------------------------------------------------------------------------
  describe('1回目成功', () => {
    it('fetch が PUT・body=blob・content-type=image/jpeg で呼ばれ、objectKey を返すこと', async () => {
      const mockFetch = setupFetchMock();
      mockFetch.mockResolvedValueOnce(makeResponse(true));

      const result = await uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      // 返り値の確認
      expect(result).toBe(OBJECT_KEY);

      // fetch の呼び出し回数
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // fetch の引数の確認
      expect(mockFetch).toHaveBeenCalledWith(SIGNED_URL, {
        method: 'PUT',
        body: BLOB,
        headers: { 'content-type': 'image/jpeg' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // テスト #2: 1回目失敗 (response.ok=false)、2回目成功
  // -------------------------------------------------------------------------
  describe('1回目 response.ok=false、2回目成功', () => {
    it('リトライして objectKey を返すこと', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 503, 'Service Unavailable'))
        .mockResolvedValueOnce(makeResponse(true));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      // 1回目完了を待つ（setTimeoutが発火する前）
      await Promise.resolve();
      await Promise.resolve();

      // 500ms の待機を進める
      jest.advanceTimersByTime(500);

      const result = await promise;

      expect(result).toBe(OBJECT_KEY);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // テスト #3: 1回目失敗 (fetch reject)、2回目成功
  // -------------------------------------------------------------------------
  describe('1回目 fetch reject、2回目成功', () => {
    it('ネットワークエラー後にリトライして objectKey を返すこと', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(makeResponse(true));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(500);

      const result = await promise;

      expect(result).toBe(OBJECT_KEY);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // テスト #4: 3回連続失敗 (response.ok=false) → エラー throw
  // -------------------------------------------------------------------------
  describe('3回連続 response.ok=false', () => {
    it('エラーを throw し、HTTP ステータスがメッセージに含まれること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      // 1回目の失敗後の待機
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      // 2回目の失敗後の待機
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('500');

      expect(mockFetch).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    it('エラーメッセージに HTTP ステータスが含まれること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 422, 'Unprocessable Entity'))
        .mockResolvedValueOnce(makeResponse(false, 422, 'Unprocessable Entity'))
        .mockResolvedValueOnce(makeResponse(false, 422, 'Unprocessable Entity'));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('422');

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // テスト #5: 3回連続失敗 (fetch reject) → エラー throw
  // -------------------------------------------------------------------------
  describe('3回連続 fetch reject', () => {
    it('ネットワークエラーを throw すること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      const networkError = new Error('Failed to fetch');
      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('Failed to fetch');

      expect(mockFetch).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // テスト #6: リトライ間の 500ms 待機の検証
  // -------------------------------------------------------------------------
  describe('リトライ待機時間', () => {
    it('2回目試行の前に 500ms の待機があること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(makeResponse(true));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      // 1回目の失敗を処理
      await Promise.resolve();
      await Promise.resolve();

      // 500ms より前は2回目の fetch が呼ばれていないこと
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 500ms 進める
      jest.advanceTimersByTime(500);

      await promise;

      // 2回目の fetch が呼ばれていること
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('1回目成功時は待機なし（setTimeout が呼ばれないこと）', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const mockFetch = setupFetchMock();
      mockFetch.mockResolvedValueOnce(makeResponse(true));

      await uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      // setTimeout が呼ばれていないこと
      expect(setTimeoutSpy).not.toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // テスト #7: fetch の呼び出し回数
  // -------------------------------------------------------------------------
  describe('fetch の呼び出し回数', () => {
    it('1回目成功時は fetch が 1 回だけ呼ばれること', async () => {
      const mockFetch = setupFetchMock();
      mockFetch.mockResolvedValueOnce(makeResponse(true));

      await uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('1回目失敗・2回目成功時は fetch が 2 回呼ばれること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 503, 'Service Unavailable'))
        .mockResolvedValueOnce(makeResponse(true));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('3回全て失敗時は fetch が 3 回呼ばれること', async () => {
      jest.useFakeTimers();

      const mockFetch = setupFetchMock();
      mockFetch
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(makeResponse(false, 500, 'Internal Server Error'));

      const promise = uploadPhoto(SIGNED_URL, BLOB, OBJECT_KEY);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });
});
