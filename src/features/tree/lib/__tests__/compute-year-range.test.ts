/**
 * computeYearRange 関数のテスト
 *
 * tree-visualization-design.md §7 タイムライン連動 に準拠した
 * 年スライダー範囲計算ロジックを検証する。
 */

import { computeYearRange, type PersonForYearRange } from '../compute-year-range';

/** 現在年 (テスト実行時の年) */
const CURRENT_YEAR = new Date().getFullYear();

describe('computeYearRange', () => {
  // -------------------------------------------------------------------------
  // 空配列
  // -------------------------------------------------------------------------
  describe('空配列', () => {
    it('persons が空配列の場合は { min: 1900, max: 現在年 } を返すこと', () => {
      const result = computeYearRange([]);

      expect(result).toEqual({ min: 1900, max: CURRENT_YEAR });
    });
  });

  // -------------------------------------------------------------------------
  // 通常ケース
  // -------------------------------------------------------------------------
  describe('通常ケース', () => {
    it('birthYear の最小値が min になること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1950, deathYear: 2020, isAlive: false },
        { birthYear: 1900, deathYear: 1970, isAlive: false },
        { birthYear: 1975, deathYear: 2015, isAlive: false },
      ];

      const result = computeYearRange(persons);

      expect(result.min).toBe(1900);
    });

    it('deathYear の最大値が max になること（全員が故人）', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1920, deathYear: 1990, isAlive: false },
        { birthYear: 1950, deathYear: 2020, isAlive: false },
        { birthYear: 1960, deathYear: 2000, isAlive: false },
      ];

      const result = computeYearRange(persons);

      expect(result.max).toBe(2020);
    });

    it('birthYear 最小〜deathYear 最大の範囲が返ること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1850, deathYear: 1920, isAlive: false },
        { birthYear: 1900, deathYear: 1980, isAlive: false },
      ];

      const result = computeYearRange(persons);

      expect(result).toEqual({ min: 1850, max: 1980 });
    });
  });

  // -------------------------------------------------------------------------
  // deathYear が null の人物を含む場合
  // -------------------------------------------------------------------------
  describe('deathYear が null の人物がいる場合', () => {
    it('存命中 (isAlive: true) の人物がいる場合は currentYear を max の候補に含めること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1950, deathYear: 2000, isAlive: false },
        { birthYear: 1980, deathYear: null, isAlive: true },
      ];

      const result = computeYearRange(persons);

      // 存命の人物がいるので currentYear が max に使われる
      expect(result.max).toBe(Math.max(2000, CURRENT_YEAR));
    });

    it('deathYear が null かつ isAlive が false の人物がいる場合も currentYear を max の候補に含めること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1920, deathYear: 1990, isAlive: false },
        { birthYear: 1950, deathYear: null, isAlive: false },
      ];

      const result = computeYearRange(persons);

      // deathYear 不明の人物がいるので currentYear が max の候補になる
      expect(result.max).toBe(Math.max(1990, CURRENT_YEAR));
    });

    it('全員が存命の場合は currentYear が max になること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1960, deathYear: null, isAlive: true },
        { birthYear: 1985, deathYear: null, isAlive: true },
      ];

      const result = computeYearRange(persons);

      expect(result.max).toBe(CURRENT_YEAR);
    });

    it('故人の deathYear より birthYear の最大値が大きい場合でも currentYear が max になること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 2010, deathYear: null, isAlive: true },
        { birthYear: 1950, deathYear: 1980, isAlive: false },
      ];

      const result = computeYearRange(persons);

      // CURRENT_YEAR > 2010 > 1980 が想定されるが、確実に max = CURRENT_YEAR
      expect(result.max).toBe(CURRENT_YEAR);
    });
  });

  // -------------------------------------------------------------------------
  // 全員の birthYear が null の場合
  // -------------------------------------------------------------------------
  describe('全員の birthYear が null の場合', () => {
    it('フォールバック値 min: 1900 が返ること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: null, deathYear: 2000, isAlive: false },
        { birthYear: null, deathYear: null, isAlive: true },
      ];

      const result = computeYearRange(persons);

      expect(result.min).toBe(1900);
    });
  });

  // -------------------------------------------------------------------------
  // 単一人物
  // -------------------------------------------------------------------------
  describe('単一人物', () => {
    it('故人の単一人物: birthYear〜deathYear の範囲が返ること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1930, deathYear: 2010, isAlive: false },
      ];

      const result = computeYearRange(persons);

      expect(result).toEqual({ min: 1930, max: 2010 });
    });

    it('存命の単一人物: birthYear〜currentYear の範囲が返ること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: 1970, deathYear: null, isAlive: true },
      ];

      const result = computeYearRange(persons);

      expect(result).toEqual({ min: 1970, max: CURRENT_YEAR });
    });

    it('birthYear が null の単一人物: min は 1900 になること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: null, deathYear: 2005, isAlive: false },
      ];

      const result = computeYearRange(persons);

      expect(result.min).toBe(1900);
    });

    it('birthYear・deathYear ともに null の単一人物: デフォルト範囲が返ること', () => {
      const persons: PersonForYearRange[] = [
        { birthYear: null, deathYear: null, isAlive: true },
      ];

      const result = computeYearRange(persons);

      expect(result).toEqual({ min: 1900, max: CURRENT_YEAR });
    });
  });

  // -------------------------------------------------------------------------
  // 境界値・異常ケース
  // -------------------------------------------------------------------------
  describe('境界値・異常ケース', () => {
    it('min > max になる場合でも min <= max が保証されること', () => {
      // birthYear だけが非常に大きく deathYear が設定されないケース
      // (理論上は起こりにくいが、防御コードのテスト)
      const persons: PersonForYearRange[] = [
        { birthYear: 2200, deathYear: null, isAlive: false },
      ];

      const result = computeYearRange(persons);

      // CURRENT_YEAR < 2200 の場合、min=2200, max=CURRENT_YEAR となり
      // 防御コードで max = min = 2200 に補正される
      expect(result.min).toBeLessThanOrEqual(result.max);
    });
  });
});
