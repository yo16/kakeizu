/**
 * @param file - 圧縮対象の画像ファイル（JPEG / PNG / WebP）
 * @returns 長辺 2048px 以下にリサイズ後、JPEG 85% で再エンコードした Blob
 */
export async function compressImage(file: File): Promise<Blob> {
  const MAX_LONG_SIDE = 2048;
  const JPEG_QUALITY = 0.85;

  const bitmap = await createImageBitmap(file);

  const { width: srcWidth, height: srcHeight } = bitmap;
  const longSide = Math.max(srcWidth, srcHeight);
  const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1;

  const dstWidth = Math.round(srcWidth * scale);
  const dstHeight = Math.round(srcHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dstWidth;
  canvas.height = dstHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('compressImage: Canvas 2D コンテキストの取得に失敗しました');
  }

  ctx.drawImage(bitmap, 0, 0, dstWidth, dstHeight);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('compressImage: toBlob が null を返しました'));
          return;
        }
        console.log(
          `[compressImage] 圧縮前: ${file.size} bytes / 圧縮後: ${blob.size} bytes` +
            ` (${srcWidth}x${srcHeight} → ${dstWidth}x${dstHeight})`
        );
        resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}
