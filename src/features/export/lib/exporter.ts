/**
 * 家系図エクスポートライブラリ
 *
 * このモジュールはブラウザ上でのみ実行される。
 * html-to-image / jspdf は browser API に依存するため、
 * 呼び出し元は必ずクライアントサイドで実行すること。
 */

import { toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { ExportOptions } from '../types';

const DEFAULT_SCALE = 2;
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_PAPER_SIZE = 'A4' as const;
const DEFAULT_ORIENTATION = 'landscape' as const;

/**
 * 指定した HTML 要素を PNG の Blob として返す
 *
 * @param targetElement キャプチャ対象の HTMLElement
 * @param options エクスポートオプション
 * @returns PNG 形式の Blob
 */
export async function exportTreeAsPng(
  targetElement: HTMLElement,
  options?: ExportOptions
): Promise<Blob> {
  const scale = options?.scale ?? DEFAULT_SCALE;
  const backgroundColor = options?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;

  const blob = await toBlob(targetElement, {
    pixelRatio: scale,
    backgroundColor,
    cacheBust: true,
  });

  if (blob === null) {
    throw new Error('PNG の生成に失敗しました');
  }

  return blob;
}

/**
 * 指定した HTML 要素を PDF の Blob として返す
 *
 * 内部で exportTreeAsPng を呼び出して PNG を取得し、
 * jsPDF の addImage でページに配置する。
 * 画像はページの幅・高さに収まるようアスペクト比を保持して中央配置する。
 *
 * @param targetElement キャプチャ対象の HTMLElement
 * @param options エクスポートオプション
 * @returns PDF 形式の Blob
 */
export async function exportTreeAsPdf(
  targetElement: HTMLElement,
  options?: ExportOptions
): Promise<Blob> {
  const paperSize = options?.paperSize ?? DEFAULT_PAPER_SIZE;
  const orientation = options?.orientation ?? DEFAULT_ORIENTATION;

  // jsPDF の orientation は 'p' | 'l' 形式でも受け付けるが、
  // 型安全のため明示的にマッピングする
  const jsPdfOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';

  const doc = new jsPDF({
    orientation: jsPdfOrientation,
    unit: 'mm',
    format: paperSize.toLowerCase(),
  });

  // ページのサイズ (mm) を取得
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();

  // PNG を取得 (高解像度でキャプチャ)
  const pngBlob = await exportTreeAsPng(targetElement, {
    scale: options?.scale ?? DEFAULT_SCALE,
    backgroundColor: options?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
  });

  // Blob を DataURL に変換
  const dataUrl = await blobToDataUrl(pngBlob);

  // 画像の元サイズ (px) からアスペクト比を計算
  const imgNaturalSize = await getImageNaturalSize(dataUrl);
  const imgAspectRatio = imgNaturalSize.width / imgNaturalSize.height;
  const pageAspectRatio = pageWidthMm / pageHeightMm;

  // アスペクト比を保持しつつページに収まるサイズを算出
  let imgWidthMm: number;
  let imgHeightMm: number;

  if (imgAspectRatio > pageAspectRatio) {
    // 画像の方が横長 → 幅をページ幅に合わせる
    imgWidthMm = pageWidthMm;
    imgHeightMm = pageWidthMm / imgAspectRatio;
  } else {
    // 画像の方が縦長 → 高さをページ高さに合わせる
    imgHeightMm = pageHeightMm;
    imgWidthMm = pageHeightMm * imgAspectRatio;
  }

  // 中央配置のオフセット計算
  const xMm = (pageWidthMm - imgWidthMm) / 2;
  const yMm = (pageHeightMm - imgHeightMm) / 2;

  doc.addImage(dataUrl, 'PNG', xMm, yMm, imgWidthMm, imgHeightMm);

  return doc.output('blob');
}

/**
 * Blob を DataURL 文字列に変換するヘルパー
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Blob から DataURL への変換に失敗しました'));
    reader.readAsDataURL(blob);
  });
}

/**
 * DataURL から画像の自然サイズを取得するヘルパー
 */
function getImageNaturalSize(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('画像サイズの取得に失敗しました'));
    img.src = dataUrl;
  });
}
