/**
 * Blob ダウンロード ユーティリティ
 */

const FILENAME_INVALID_CHARS = /[/\\:*?"<>|]/g;

/**
 * Blob を指定ファイル名でダウンロードする
 * (object URL → 動的 <a> → click → revoke)
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/**
 * ファイル名に使用できない文字を _ に置換する
 */
export function sanitizeFileName(name: string): string {
  return name.replace(FILENAME_INVALID_CHARS, '_');
}

/**
 * エクスポートファイル名を生成する
 * 形式: {ツリータイトル}_{YYYY-MM-DD}.{ext}
 */
export function buildExportFileName(
  treeTitle: string | null | undefined,
  format: 'png' | 'pdf',
  date: Date = new Date()
): string {
  const trimmed = treeTitle?.trim();
  const safeName = sanitizeFileName(trimmed && trimmed.length > 0 ? trimmed : 'kakeizu');
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${safeName}_${yyyy}-${mm}-${dd}.${format}`;
}
