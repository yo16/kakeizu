/**
 * paper-sizes.ts の単体テスト
 *
 * PAPER_SIZES_MM 定数値、mmToPx 変換関数、getPaperPxSize のportrait/landscape切り替えを検証する。
 */

import {
  PAPER_SIZES_MM,
  MM_PER_INCH,
  DEFAULT_DPI,
  mmToPx,
  getPaperPxSize,
} from '../lib/paper-sizes';

describe('PAPER_SIZES_MM', () => {
  it('A4 のサイズが正しいこと', () => {
    expect(PAPER_SIZES_MM.A4).toEqual({ widthMm: 210, heightMm: 297 });
  });

  it('A3 のサイズが正しいこと', () => {
    expect(PAPER_SIZES_MM.A3).toEqual({ widthMm: 297, heightMm: 420 });
  });

  it('B4 のサイズが正しいこと', () => {
    expect(PAPER_SIZES_MM.B4).toEqual({ widthMm: 257, heightMm: 364 });
  });

  it('B5 のサイズが正しいこと', () => {
    expect(PAPER_SIZES_MM.B5).toEqual({ widthMm: 182, heightMm: 257 });
  });

  it('MM_PER_INCH が 25.4 であること', () => {
    expect(MM_PER_INCH).toBe(25.4);
  });

  it('DEFAULT_DPI が 96 であること', () => {
    expect(DEFAULT_DPI).toBe(96);
  });
});

describe('mmToPx', () => {
  it('1 インチ (25.4mm) は 96px になること (96 DPI)', () => {
    expect(mmToPx(25.4, 96)).toBeCloseTo(96, 5);
  });

  it('0mm は 0px になること', () => {
    expect(mmToPx(0)).toBe(0);
  });

  it('DPI 引数を省略した場合にデフォルト 96 DPI で計算されること', () => {
    // 210mm @ 96 DPI = (210 / 25.4) * 96 ≈ 793.7...
    const expected = (210 / 25.4) * 96;
    expect(mmToPx(210)).toBeCloseTo(expected, 5);
  });

  it('カスタム DPI (72) での計算が正しいこと', () => {
    const expected = (25.4 / 25.4) * 72; // 1 inch @ 72 DPI = 72px
    expect(mmToPx(25.4, 72)).toBeCloseTo(expected, 5);
  });

  it('カスタム DPI (150) での計算が正しいこと', () => {
    const expected = (50 / 25.4) * 150;
    expect(mmToPx(50, 150)).toBeCloseTo(expected, 5);
  });
});

describe('getPaperPxSize', () => {
  describe('A4', () => {
    it('portrait: widthPx ≈ 794, heightPx ≈ 1123 になること', () => {
      const result = getPaperPxSize('A4', 'portrait');
      expect(result.widthPx).toBe(Math.round((210 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((297 / 25.4) * 96));
    });

    it('landscape: widthPx ≈ 1123, heightPx ≈ 794 になること', () => {
      const result = getPaperPxSize('A4', 'landscape');
      expect(result.widthPx).toBe(Math.round((297 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((210 / 25.4) * 96));
    });

    it('portrait の widthPx が landscape の heightPx と等しいこと', () => {
      const portrait = getPaperPxSize('A4', 'portrait');
      const landscape = getPaperPxSize('A4', 'landscape');
      expect(portrait.widthPx).toBe(landscape.heightPx);
      expect(portrait.heightPx).toBe(landscape.widthPx);
    });
  });

  describe('A3', () => {
    it('portrait のサイズが正しいこと', () => {
      const result = getPaperPxSize('A3', 'portrait');
      expect(result.widthPx).toBe(Math.round((297 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((420 / 25.4) * 96));
    });

    it('landscape のサイズが正しいこと', () => {
      const result = getPaperPxSize('A3', 'landscape');
      expect(result.widthPx).toBe(Math.round((420 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((297 / 25.4) * 96));
    });
  });

  describe('B4', () => {
    it('portrait のサイズが正しいこと', () => {
      const result = getPaperPxSize('B4', 'portrait');
      expect(result.widthPx).toBe(Math.round((257 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((364 / 25.4) * 96));
    });

    it('landscape のサイズが正しいこと', () => {
      const result = getPaperPxSize('B4', 'landscape');
      expect(result.widthPx).toBe(Math.round((364 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((257 / 25.4) * 96));
    });
  });

  describe('B5', () => {
    it('portrait のサイズが正しいこと', () => {
      const result = getPaperPxSize('B5', 'portrait');
      expect(result.widthPx).toBe(Math.round((182 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((257 / 25.4) * 96));
    });

    it('landscape のサイズが正しいこと', () => {
      const result = getPaperPxSize('B5', 'landscape');
      expect(result.widthPx).toBe(Math.round((257 / 25.4) * 96));
      expect(result.heightPx).toBe(Math.round((182 / 25.4) * 96));
    });
  });

  describe('カスタム DPI', () => {
    it('DPI を 144 に設定した場合に正しい px が返ること', () => {
      const result = getPaperPxSize('A4', 'portrait', 144);
      expect(result.widthPx).toBe(Math.round((210 / 25.4) * 144));
      expect(result.heightPx).toBe(Math.round((297 / 25.4) * 144));
    });
  });
});
