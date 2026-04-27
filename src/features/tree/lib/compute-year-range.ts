/**
 * computeYearRange
 *
 * tree-visualization-design.md §7 タイムライン連動 に準拠。
 * persons の birth_year / death_year から年スライダーの min/max を計算する。
 *
 * - min: persons の birthYear の最小値
 * - max: persons の deathYear の最大値 (存命中 = isAlive は currentYear として扱う)
 * - データなし: デフォルト { min: 1900, max: currentYear }
 */

/** computeYearRange に渡す最低限の人物情報 */
export interface PersonForYearRange {
  birthYear: number | null;
  deathYear: number | null;
  isAlive: boolean;
}

export interface YearRange {
  min: number;
  max: number;
}

/**
 * persons 配列から年スライダーの範囲を計算する。
 *
 * @param persons - 計算対象の人物一覧
 * @returns { min, max } — min は生年の最小値、max は没年または現在年の最大値
 */
export function computeYearRange(persons: PersonForYearRange[]): YearRange {
  const currentYear = new Date().getFullYear();

  if (persons.length === 0) {
    return { min: 1900, max: currentYear };
  }

  let min = Infinity;
  let max = -Infinity;

  for (const person of persons) {
    if (person.birthYear !== null) {
      if (person.birthYear < min) {
        min = person.birthYear;
      }
    }

    if (!person.isAlive && person.deathYear !== null) {
      if (person.deathYear > max) {
        max = person.deathYear;
      }
    } else {
      // 存命中、または没年不明の場合は現在年を上限として使用
      if (currentYear > max) {
        max = currentYear;
      }
    }
  }

  // birth_year が1件もなかった場合はデフォルト min
  if (min === Infinity) {
    min = 1900;
  }

  // 没年・存命情報が1件もなかった場合はデフォルト max
  if (max === -Infinity) {
    max = currentYear;
  }

  // min > max になる異常ケースを防ぐ
  if (min > max) {
    max = min;
  }

  return { min, max };
}
