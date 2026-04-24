/**
 * 署名付きUploadURLに Blob を PUT でアップロードする。
 * 失敗時は最大2回リトライ（合計3回試行）。
 *
 * @param signedUrl  /api/storage/signed-upload が返した uploadUrl
 * @param blob       compressImage() が返す圧縮済み Blob
 * @param objectKey  Route Handler から受け取った objectKey（そのまま返す）
 * @returns objectKey （呼び出し側の便宜のため）
 * @throws 3回失敗時
 */
export async function uploadPhoto(
  signedUrl: string,
  blob: Blob,
  objectKey: string
): Promise<string> {
  const MAX_ATTEMPTS = 3;
  const RETRY_WAIT_MS = 500;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    }

    try {
      const response = await fetch(signedUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': 'image/jpeg' },
      });

      if (response.ok) {
        return objectKey;
      }

      lastError = new Error(
        `Upload failed: HTTP ${response.status} ${response.statusText}`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Upload failed after 3 attempts');
}
