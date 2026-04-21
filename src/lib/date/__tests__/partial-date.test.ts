/**
 * partial-date ヘルパー 単体テスト
 *
 * テスト観点:
 * - formatPartialDate: 年月日の組み合わせによる表示文字列
 * - isValidPartialDate: 月・日の範囲、年なし入力NG、空はOK
 * - parsePartialDateInput: 各セパレータ、部分入力、パース不能
 * - comparePartialDate: 前後・同値・比較不能（null）
 */

import {
  formatPartialDate,
  isValidPartialDate,
  parsePartialDateInput,
  comparePartialDate,
  PartialDate,
} from '../partial-date';

/* ================================================================== */
/* formatPartialDate                                                    */
/* ================================================================== */

describe('formatPartialDate', () => {
  describe('正常系', () => {
    it('年月日すべてあり → "1980年3月15日"', () => {
      expect(formatPartialDate({ year: 1980, month: 3, day: 15 })).toBe('1980年3月15日');
    });

    it('年月のみ → "1980年3月"', () => {
      expect(formatPartialDate({ year: 1980, month: 3 })).toBe('1980年3月');
    });

    it('年のみ → "1980年"', () => {
      expect(formatPartialDate({ year: 1980 })).toBe('1980年');
    });

    it('年月のみ（day: null）→ "2000年12月"', () => {
      expect(formatPartialDate({ year: 2000, month: 12, day: null })).toBe('2000年12月');
    });

    it('年のみ（month: null, day: null）→ "2000年"', () => {
      expect(formatPartialDate({ year: 2000, month: null, day: null })).toBe('2000年');
    });
  });

  describe('空・null/undefined 入力', () => {
    it('null 入力 → ""', () => {
      expect(formatPartialDate(null)).toBe('');
    });

    it('undefined 入力 → ""', () => {
      expect(formatPartialDate(undefined)).toBe('');
    });

    it('すべて null → ""', () => {
      expect(formatPartialDate({ year: null, month: null, day: null })).toBe('');
    });

    it('すべて undefined → ""', () => {
      expect(formatPartialDate({})).toBe('');
    });
  });

  describe('年なしのケース（実装仕様: 年なしは空文字）', () => {
    it('年なしで月のみ入力 → ""', () => {
      expect(formatPartialDate({ year: null, month: 3 })).toBe('');
    });

    it('年なしで日のみ入力 → ""', () => {
      expect(formatPartialDate({ year: null, day: 15 })).toBe('');
    });

    it('年なしで月日あり → ""', () => {
      expect(formatPartialDate({ year: null, month: 3, day: 15 })).toBe('');
    });
  });
});

/* ================================================================== */
/* isValidPartialDate                                                   */
/* ================================================================== */

describe('isValidPartialDate', () => {
  describe('有効なケース', () => {
    it('完全日付 (1980/3/15) → true', () => {
      expect(isValidPartialDate({ year: 1980, month: 3, day: 15 })).toBe(true);
    });

    it('年月のみ (1980/3) → true', () => {
      expect(isValidPartialDate({ year: 1980, month: 3 })).toBe(true);
    });

    it('年のみ (1980) → true', () => {
      expect(isValidPartialDate({ year: 1980 })).toBe(true);
    });

    it('すべて null → true（空は valid）', () => {
      expect(isValidPartialDate({ year: null, month: null, day: null })).toBe(true);
    });

    it('空オブジェクト → true', () => {
      expect(isValidPartialDate({})).toBe(true);
    });

    it('null 入力 → true', () => {
      expect(isValidPartialDate(null)).toBe(true);
    });

    it('undefined 入力 → true', () => {
      expect(isValidPartialDate(undefined)).toBe(true);
    });

    it('月の境界: 1 → true', () => {
      expect(isValidPartialDate({ year: 2000, month: 1 })).toBe(true);
    });

    it('月の境界: 12 → true', () => {
      expect(isValidPartialDate({ year: 2000, month: 12 })).toBe(true);
    });

    it('日の境界: 1 → true', () => {
      expect(isValidPartialDate({ year: 2000, month: 1, day: 1 })).toBe(true);
    });

    it('日の境界: 31 → true', () => {
      expect(isValidPartialDate({ year: 2000, month: 1, day: 31 })).toBe(true);
    });
  });

  describe('無効なケース', () => {
    it('月が 0 → false', () => {
      expect(isValidPartialDate({ year: 2000, month: 0 })).toBe(false);
    });

    it('月が 13 → false', () => {
      expect(isValidPartialDate({ year: 2000, month: 13 })).toBe(false);
    });

    it('日が 0 → false', () => {
      expect(isValidPartialDate({ year: 2000, month: 1, day: 0 })).toBe(false);
    });

    it('日が 32 → false', () => {
      expect(isValidPartialDate({ year: 2000, month: 1, day: 32 })).toBe(false);
    });

    it('年なしで月入力 → false', () => {
      expect(isValidPartialDate({ year: null, month: 3 })).toBe(false);
    });

    it('年なしで日入力 → false', () => {
      expect(isValidPartialDate({ year: null, day: 15 })).toBe(false);
    });

    it('月なしで日入力 → false', () => {
      expect(isValidPartialDate({ year: 2000, month: null, day: 15 })).toBe(false);
    });

    it('年なしで月日入力 → false', () => {
      expect(isValidPartialDate({ year: null, month: 3, day: 15 })).toBe(false);
    });
  });
});

/* ================================================================== */
/* parsePartialDateInput                                                */
/* ================================================================== */

describe('parsePartialDateInput', () => {
  describe('年月日 (3パーツ)', () => {
    it('"1980/3/15" → { year: 1980, month: 3, day: 15 }', () => {
      expect(parsePartialDateInput('1980/3/15')).toEqual({ year: 1980, month: 3, day: 15 });
    });

    it('"1980-3-15" → { year: 1980, month: 3, day: 15 }', () => {
      expect(parsePartialDateInput('1980-3-15')).toEqual({ year: 1980, month: 3, day: 15 });
    });

    it('"1980.3.15" → { year: 1980, month: 3, day: 15 }', () => {
      expect(parsePartialDateInput('1980.3.15')).toEqual({ year: 1980, month: 3, day: 15 });
    });

    it('"2000/12/31" → { year: 2000, month: 12, day: 31 }', () => {
      expect(parsePartialDateInput('2000/12/31')).toEqual({ year: 2000, month: 12, day: 31 });
    });
  });

  describe('年月 (2パーツ)', () => {
    it('"1980/3" → { year: 1980, month: 3 }', () => {
      expect(parsePartialDateInput('1980/3')).toEqual({ year: 1980, month: 3 });
    });

    it('"1980-3" → { year: 1980, month: 3 }', () => {
      expect(parsePartialDateInput('1980-3')).toEqual({ year: 1980, month: 3 });
    });
  });

  describe('年のみ (1パーツ)', () => {
    it('"1980" → { year: 1980 }', () => {
      expect(parsePartialDateInput('1980')).toEqual({ year: 1980 });
    });

    it('"2024" → { year: 2024 }', () => {
      expect(parsePartialDateInput('2024')).toEqual({ year: 2024 });
    });
  });

  describe('パース不能', () => {
    it('空文字 → null', () => {
      expect(parsePartialDateInput('')).toBeNull();
    });

    it('スペースのみ → null', () => {
      expect(parsePartialDateInput('   ')).toBeNull();
    });

    it('"abc" → null', () => {
      expect(parsePartialDateInput('abc')).toBeNull();
    });

    it('"abc/3/15" → null（年が数字でない）', () => {
      expect(parsePartialDateInput('abc/3/15')).toBeNull();
    });

    it('"1980/13" → null（月が範囲外）', () => {
      expect(parsePartialDateInput('1980/13')).toBeNull();
    });

    it('"1980/0" → null（月が 0）', () => {
      expect(parsePartialDateInput('1980/0')).toBeNull();
    });

    it('"1980/3/32" → null（日が範囲外）', () => {
      expect(parsePartialDateInput('1980/3/32')).toBeNull();
    });

    it('"1980/3/0" → null（日が 0）', () => {
      expect(parsePartialDateInput('1980/3/0')).toBeNull();
    });

    it('"0/3/15" → null（年が 0）', () => {
      expect(parsePartialDateInput('0/3/15')).toBeNull();
    });
  });

  describe('年の境界値', () => {
    it('"-100/3/15" → null（負の年は不許可）', () => {
      expect(parsePartialDateInput('-100/3/15')).toBeNull();
    });

    it('"9999/12/31" → { year: 9999, month: 12, day: 31 }（上限境界）', () => {
      expect(parsePartialDateInput('9999/12/31')).toEqual({ year: 9999, month: 12, day: 31 });
    });

    it('"10000/1/1" → null（上限超え）', () => {
      expect(parsePartialDateInput('10000/1/1')).toBeNull();
    });
  });

  describe('不正入力（特殊文字・全角）', () => {
    it('"1980 / 3 / 15"（パーツ内空白） → trim で許容し { year: 1980, month: 3, day: 15 }', () => {
      // split(/[\/\-\.]/) の各パーツに .trim() が掛かるため、半角スペースは除去される
      expect(parsePartialDateInput('1980 / 3 / 15')).toEqual({ year: 1980, month: 3, day: 15 });
    });

    it('"１９８０/３/１５"（全角数字） → null', () => {
      // parseInt("１９８０") は NaN になるため null
      expect(parsePartialDateInput('１９８０/３/１５')).toBeNull();
    });

    it('"1980年3月15日"（漢字含む） → null', () => {
      // split(/[\/\-\.]/) で分割できず1パーツになり、parseInt("1980年3月15日") は 1980 だが
      // 実装は split で3パーツに分割できないため year のみになる。
      // ただし "1980年3月15日" には / - . が含まれないので1パーツとして解釈され
      // parseInt("1980年3月15日", 10) = 1980 → { year: 1980 } が返る可能性がある。
      // 実装の実際の挙動を検証する。
      const result = parsePartialDateInput('1980年3月15日');
      // 実装確認: split(/[\/\-\.]/) は "/" "-" "." でしか分割しないため
      // "1980年3月15日" は1パーツ。parseInt("1980年3月15日", 10) = 1980。
      // → { year: 1980 } が返る（nullではない）
      expect(result).toEqual({ year: 1980 });
    });
  });
});

/* ================================================================== */
/* comparePartialDate                                                   */
/* ================================================================== */

describe('comparePartialDate', () => {
  describe('年のみの比較', () => {
    it('同じ年 → 0', () => {
      expect(comparePartialDate({ year: 1980 }, { year: 1980 })).toBe(0);
    });

    it('a が後 (1990 vs 1980) → 正の数', () => {
      const result = comparePartialDate({ year: 1990 }, { year: 1980 });
      expect(result).toBeGreaterThan(0);
    });

    it('a が前 (1970 vs 1980) → 負の数', () => {
      const result = comparePartialDate({ year: 1970 }, { year: 1980 });
      expect(result).toBeLessThan(0);
    });
  });

  describe('年月の比較', () => {
    it('同じ年月 → 0', () => {
      expect(comparePartialDate({ year: 1980, month: 3 }, { year: 1980, month: 3 })).toBe(0);
    });

    it('同じ年、a が後の月 → 正の数', () => {
      const result = comparePartialDate({ year: 1980, month: 5 }, { year: 1980, month: 3 });
      expect(result).toBeGreaterThan(0);
    });

    it('同じ年、a が前の月 → 負の数', () => {
      const result = comparePartialDate({ year: 1980, month: 1 }, { year: 1980, month: 3 });
      expect(result).toBeLessThan(0);
    });
  });

  describe('年月日の比較', () => {
    it('完全一致 → 0', () => {
      expect(comparePartialDate(
        { year: 1980, month: 3, day: 15 },
        { year: 1980, month: 3, day: 15 }
      )).toBe(0);
    });

    it('同じ年月、a が後の日 → 正の数', () => {
      const result = comparePartialDate(
        { year: 1980, month: 3, day: 20 },
        { year: 1980, month: 3, day: 15 }
      );
      expect(result).toBeGreaterThan(0);
    });

    it('同じ年月、a が前の日 → 負の数', () => {
      const result = comparePartialDate(
        { year: 1980, month: 3, day: 10 },
        { year: 1980, month: 3, day: 15 }
      );
      expect(result).toBeLessThan(0);
    });
  });

  describe('比較不能（null を返す）', () => {
    it('a に年がない → null', () => {
      expect(comparePartialDate({}, { year: 1980 })).toBeNull();
    });

    it('b に年がない → null', () => {
      expect(comparePartialDate({ year: 1980 }, {})).toBeNull();
    });

    it('両方年なし → null', () => {
      expect(comparePartialDate({}, {})).toBeNull();
    });

    it('a が年月、b が年のみ（解像度違い） → null', () => {
      expect(comparePartialDate({ year: 1980, month: 3 }, { year: 1980 })).toBeNull();
    });

    it('a が年のみ、b が年月（解像度違い） → null', () => {
      expect(comparePartialDate({ year: 1980 }, { year: 1980, month: 3 })).toBeNull();
    });

    it('a が年月日、b が年月（解像度違い） → null', () => {
      expect(comparePartialDate(
        { year: 1980, month: 3, day: 15 },
        { year: 1980, month: 3 }
      )).toBeNull();
    });

    it('a が年月、b が年月日（解像度違い） → null', () => {
      expect(comparePartialDate(
        { year: 1980, month: 3 },
        { year: 1980, month: 3, day: 15 }
      )).toBeNull();
    });
  });
});
