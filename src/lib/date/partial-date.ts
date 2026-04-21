/**
 * 曖昧日付（PartialDate）ヘルパー
 *
 * year/month/day をそれぞれ省略できる日付型と
 * 表示・バリデーション・パース・比較の4関数を提供する。
 */

export type PartialDate = {
  year?: number | null;
  month?: number | null;
  day?: number | null;
};

/**
 * 表示用文字列化
 *
 * - year/month/day すべて存在: "1980年3月15日"
 * - year/month のみ:           "1980年3月"
 * - year のみ:                 "1980年"
 * - すべて未入力 (null/undefined): ""
 */
export function formatPartialDate(d: PartialDate | null | undefined): string {
  if (!d) return '';

  const year = d.year ?? null;
  const month = d.month ?? null;
  const day = d.day ?? null;

  if (year == null) return '';

  let result = `${year}年`;
  if (month != null) {
    result += `${month}月`;
    if (day != null) {
      result += `${day}日`;
    }
  }
  return result;
}

/**
 * 妥当性判定
 *
 * - 月は 1-12
 * - 日は 1-31
 * - 年なしで月/日のみ入力はNG
 * - すべて未入力はOK（空として扱う）
 */
export function isValidPartialDate(d: PartialDate | null | undefined): boolean {
  if (!d) return true;

  const year = d.year ?? null;
  const month = d.month ?? null;
  const day = d.day ?? null;

  // すべて未入力はOK
  if (year == null && month == null && day == null) return true;

  // 年なしで月または日が入力されているのはNG
  if (year == null && (month != null || day != null)) return false;

  // 月の範囲チェック
  if (month != null && (month < 1 || month > 12)) return false;

  // 日の範囲チェック
  if (day != null && (day < 1 || day > 31)) return false;

  // 年なしで日のみはNG（月なしで日のみもNG）
  if (month == null && day != null) return false;

  return true;
}

/**
 * テキスト入力からパース
 *
 * 対応フォーマット:
 * - "1980/3/15", "1980-3-15", "1980.3.15"  → { year: 1980, month: 3, day: 15 }
 * - "1980/3",   "1980-3"                    → { year: 1980, month: 3 }
 * - "1980"                                  → { year: 1980 }
 * - パース不能の場合は null
 */
export function parsePartialDateInput(str: string): PartialDate | null {
  if (!str || str.trim() === '') return null;

  const trimmed = str.trim();

  // セパレータ（/ - .）で分割を試みる
  const parts = trimmed.split(/[\/\-\.]/).map((p) => p.trim());

  if (parts.length === 0) return null;

  const year = parseInt(parts[0], 10);
  if (isNaN(year) || year < 1 || year > 9999) return null;

  if (parts.length === 1) {
    return { year };
  }

  const month = parseInt(parts[1], 10);
  if (isNaN(month) || month < 1 || month > 12) return null;

  if (parts.length === 2) {
    return { year, month };
  }

  const day = parseInt(parts[2], 10);
  if (isNaN(day) || day < 1 || day > 31) return null;

  return { year, month, day };
}

/**
 * 2つのPartialDateを比較
 *
 * - 戻り値:
 *   - 0:    等価
 *   - 正数:  a が b より後
 *   - 負数:  a が b より前
 *   - null:  比較不能（どちらかに比較に必要な情報がない）
 *
 * 比較可能条件: 両方に year が存在すること
 * month/day は存在するフィールドのみ比較に使用する。
 * 一方にあって他方にないフィールドがある場合は null を返す。
 */
export function comparePartialDate(
  a: PartialDate,
  b: PartialDate
): number | null {
  const aYear = a.year ?? null;
  const bYear = b.year ?? null;

  // 年がどちらかに存在しない場合は比較不能
  if (aYear == null || bYear == null) return null;

  if (aYear !== bYear) return aYear - bYear;

  // 年が等しい場合、月の比較
  const aMonth = a.month ?? null;
  const bMonth = b.month ?? null;

  // 一方にのみ月がある場合は比較不能
  if ((aMonth == null) !== (bMonth == null)) return null;

  if (aMonth != null && bMonth != null) {
    if (aMonth !== bMonth) return aMonth - bMonth;

    // 月も等しい場合、日の比較
    const aDay = a.day ?? null;
    const bDay = b.day ?? null;

    // 一方にのみ日がある場合は比較不能
    if ((aDay == null) !== (bDay == null)) return null;

    if (aDay != null && bDay != null) {
      return aDay - bDay;
    }
  }

  // ここまで等しければ 0（両方 month/day が null の場合も含む）
  return 0;
}
