/**
 * 用紙サイズ定数と mm/px 変換ユーティリティ
 */

import type { PaperSize, PaperDimensions, Orientation } from '../types';

export const PAPER_SIZES_MM: Record<PaperSize, PaperDimensions> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  B4: { widthMm: 257, heightMm: 364 },
  B5: { widthMm: 182, heightMm: 257 },
};

export const MM_PER_INCH = 25.4;
export const DEFAULT_DPI = 96;

/**
 * mm を px に変換する
 */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return (mm / MM_PER_INCH) * dpi;
}

/**
 * 用紙サイズと方向に基づき、px 単位の幅・高さを返す
 */
export function getPaperPxSize(
  paperSize: PaperSize,
  orientation: Orientation,
  dpi: number = DEFAULT_DPI
): { widthPx: number; heightPx: number } {
  const { widthMm, heightMm } = PAPER_SIZES_MM[paperSize];
  const [w, h] =
    orientation === 'portrait' ? [widthMm, heightMm] : [heightMm, widthMm];
  return {
    widthPx: Math.round(mmToPx(w, dpi)),
    heightPx: Math.round(mmToPx(h, dpi)),
  };
}
