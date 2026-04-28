/**
 * エクスポート機能の型定義
 */

export type PaperSize = 'A4' | 'A3' | 'B4' | 'B5';
export type Orientation = 'portrait' | 'landscape';
export type ExportFormat = 'png' | 'pdf';

export interface PaperDimensions {
  widthMm: number;
  heightMm: number;
}

export interface ExportOptions {
  paperSize?: PaperSize;
  orientation?: Orientation;
  /** PNG解像度倍率 (デフォルト 2) */
  scale?: number;
  /** PNG/PDF 背景色 (デフォルト '#ffffff') */
  backgroundColor?: string;
}
