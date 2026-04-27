/**
 * pickPhotoByYear — 年に最も近い写真を選択する純粋関数
 *
 * tree-visualization-design.md §7 タイムライン連動 の写真切替ロジックに準拠。
 *
 * - currentYear が null → fallback を返す
 * - taken_year が null の写真は候補から除外
 * - 候補がなければ fallback を返す
 * - currentYear との差が最小の写真を選択
 * - 同点の場合は taken_year が大きい方 (新しい方) を優先
 */

/**
 * `pickPhotoByYear` が受け入れる写真の最小インターフェース。
 * PhotoSummary (camelCase) に準拠。
 */
export interface PhotoForYear {
  id: string;
  /** 写真の公開/署名付き URL */
  url: string;
  /** 撮影年 (null = 不明 → 候補から除外) */
  takenYear: number | null;
}

/**
 * `photos` の中から `year` に最も近い撮影年を持つ写真を返す。
 *
 * @param photos   対象の写真一覧
 * @param year     基準年 (null の場合は fallback を返す)
 * @param fallback 候補がない場合に返す写真 (null 可)
 * @returns 選択された写真、または fallback
 */
export function pickPhotoByYear<T extends PhotoForYear>(
  photos: T[],
  year: number | null,
  fallback: T | null
): T | null {
  // currentYear が未設定 → 代表写真 (fallback) を表示
  if (year === null) {
    return fallback;
  }

  // taken_year が null の写真は対象外
  const candidates = photos.filter((p) => p.takenYear !== null);

  if (candidates.length === 0) {
    return fallback;
  }

  // currentYear との差が最小の写真を選択
  // 同点の場合は taken_year が大きい方 (新しい方) を優先
  let best: T = candidates[0];
  let bestDiff = Math.abs((candidates[0].takenYear as number) - year);

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const diff = Math.abs((candidate.takenYear as number) - year);

    if (diff < bestDiff) {
      // より近い写真
      best = candidate;
      bestDiff = diff;
    } else if (diff === bestDiff) {
      // 同点 → taken_year が大きい方 (新しい方) を優先
      if ((candidate.takenYear as number) > (best.takenYear as number)) {
        best = candidate;
        // bestDiff は同じなので更新不要
      }
    }
  }

  return best;
}
