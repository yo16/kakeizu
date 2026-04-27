/**
 * pickPhotoByYear 純粋関数のテスト
 *
 * tree-visualization-design.md §7 タイムライン連動 の写真切替ロジックに準拠。
 * kakeizu-rgs.2 受け入れ条件:
 *   - 年変更時にノードの写真が切り替わること
 *   - 写真なし・年情報なしのエッジケースが正常に動作すること
 */

import { pickPhotoByYear, type PhotoForYear } from '../select-by-year';

// ---------------------------------------------------------------------------
// テストデータファクトリ
// ---------------------------------------------------------------------------

function makePhoto(id: string, takenYear: number | null, url?: string): PhotoForYear {
  return {
    id,
    url: url ?? `https://example.com/${id}.jpg`,
    takenYear,
  };
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('pickPhotoByYear', () => {
  // -------------------------------------------------------------------------
  // year === null の場合
  // -------------------------------------------------------------------------
  describe('year === null の場合', () => {
    it('fallback が Photo の場合はそれを返すこと', () => {
      const fallback = makePhoto('fallback', null);
      const photos = [makePhoto('p1', 1980)];

      const result = pickPhotoByYear(photos, null, fallback);

      expect(result).toBe(fallback);
    });

    it('fallback が null の場合は null を返すこと', () => {
      const photos = [makePhoto('p1', 1980)];

      const result = pickPhotoByYear(photos, null, null);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // photos が空配列の場合
  // -------------------------------------------------------------------------
  describe('photos が空配列の場合', () => {
    it('fallback を返すこと', () => {
      const fallback = makePhoto('fallback', null);

      const result = pickPhotoByYear([], 1980, fallback);

      expect(result).toBe(fallback);
    });

    it('fallback が null の場合は null を返すこと', () => {
      const result = pickPhotoByYear([], 1980, null);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // photos 全件 takenYear === null の場合
  // -------------------------------------------------------------------------
  describe('photos 全件 takenYear === null の場合', () => {
    it('fallback を返すこと', () => {
      const fallback = makePhoto('fallback', null);
      const photos = [
        makePhoto('p1', null),
        makePhoto('p2', null),
        makePhoto('p3', null),
      ];

      const result = pickPhotoByYear(photos, 1980, fallback);

      expect(result).toBe(fallback);
    });

    it('fallback も null の場合は null を返すこと', () => {
      const photos = [makePhoto('p1', null), makePhoto('p2', null)];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 通常ケース: 年差が最小の写真を返す
  // -------------------------------------------------------------------------
  describe('通常ケース', () => {
    it('年差が最小の写真を返すこと', () => {
      const p1 = makePhoto('p1', 1970);
      const p2 = makePhoto('p2', 1985);
      const p3 = makePhoto('p3', 2000);
      const photos = [p1, p2, p3];

      // currentYear=1983: |1970-1983|=13, |1985-1983|=2, |2000-1983|=17 → p2
      const result = pickPhotoByYear(photos, 1983, null);

      expect(result).toBe(p2);
    });

    it('完全一致する写真が含まれる場合、その写真を返すこと', () => {
      const p1 = makePhoto('p1', 1970);
      const p2 = makePhoto('p2', 1980);
      const p3 = makePhoto('p3', 1990);
      const photos = [p1, p2, p3];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBe(p2);
    });

    it('単一写真 (takenYear あり) の場合はその写真を返すこと', () => {
      const p1 = makePhoto('p1', 1975);

      const result = pickPhotoByYear([p1], 2000, null);

      expect(result).toBe(p1);
    });
  });

  // -------------------------------------------------------------------------
  // 同点処理: 差が同じなら taken_year が大きい方（新しい方）を優先
  // -------------------------------------------------------------------------
  describe('同点処理', () => {
    it('差が等しい場合は takenYear が大きい方（新しい方）を返すこと', () => {
      // currentYear=1980, 候補 takenYear=1975 と 1985 → |1975-1980|=5, |1985-1980|=5
      // 同点なので takenYear が大きい 1985 を優先
      const p1975 = makePhoto('p1975', 1975);
      const p1985 = makePhoto('p1985', 1985);
      const photos = [p1975, p1985];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBe(p1985);
    });

    it('配列の並び順が逆でも takenYear が大きい方を返すこと', () => {
      const p1985 = makePhoto('p1985', 1985);
      const p1975 = makePhoto('p1975', 1975);
      const photos = [p1985, p1975];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBe(p1985);
    });

    it('同点が3枚ある場合は最も新しい takenYear を返すこと', () => {
      // currentYear=1980, 差=5 → 1975, 1985 が同点。差=3 → 1977 が最小
      // より差が小さい 1977 が選ばれる
      const p1977 = makePhoto('p1977', 1977);
      const p1975 = makePhoto('p1975', 1975);
      const p1985 = makePhoto('p1985', 1985);
      const photos = [p1975, p1977, p1985];

      // currentYear=1980: |1975-1980|=5, |1977-1980|=3, |1985-1980|=5 → p1977
      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBe(p1977);
    });

    it('差が同一の3枚から最も新しい takenYear を選ぶこと', () => {
      // currentYear=1980 として差=5 が3枚: takenYear=1975, 1985, 同差で1975と1985以外に選択肢がない場合
      // 別ケース: currentYear=1980, takenYear=1975 と 1985 → 1985 を選ぶ
      // さらに同差: takenYear=1970 と 1990 → 1990 を選ぶ (差=10 で同点)
      const p1970 = makePhoto('p1970', 1970);
      const p1990 = makePhoto('p1990', 1990);
      const photos = [p1970, p1990];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBe(p1990);
    });
  });

  // -------------------------------------------------------------------------
  // takenYear === null 除外
  // -------------------------------------------------------------------------
  describe('takenYear === null の除外', () => {
    it('null の写真は候補から除外され、null 以外から最小差を選ぶこと', () => {
      const pNull = makePhoto('pNull', null);
      const p1970 = makePhoto('p1970', 1970);
      const p1985 = makePhoto('p1985', 1985);
      const photos = [pNull, p1970, p1985];

      // currentYear=1982: |1970-1982|=12, |1985-1982|=3 → p1985
      const result = pickPhotoByYear(photos, 1982, null);

      expect(result).toBe(p1985);
    });

    it('takenYear が null の写真が混在していても正しい写真を選択すること', () => {
      const pNull1 = makePhoto('pNull1', null);
      const pNull2 = makePhoto('pNull2', null);
      const pValid = makePhoto('pValid', 1975);
      const photos = [pNull1, pNull2, pValid];

      const result = pickPhotoByYear(photos, 2000, null);

      expect(result).toBe(pValid);
    });
  });

  // -------------------------------------------------------------------------
  // fallback === null + 候補なし
  // -------------------------------------------------------------------------
  describe('fallback === null + 候補なし', () => {
    it('candidates が空で fallback が null の場合は null を返すこと', () => {
      const photos = [makePhoto('p1', null)];

      const result = pickPhotoByYear(photos, 1980, null);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 入力配列の不変性
  // -------------------------------------------------------------------------
  describe('入力配列の不変性', () => {
    it('関数呼び出し後も photos 配列が mutate されていないこと', () => {
      const photos = [
        makePhoto('p1', 1970),
        makePhoto('p2', 1980),
        makePhoto('p3', 1990),
      ];
      const originalLength = photos.length;
      const originalFirst = photos[0];
      const originalSecond = photos[1];
      const originalThird = photos[2];

      pickPhotoByYear(photos, 1985, null);

      // 配列の長さが変わっていないこと
      expect(photos).toHaveLength(originalLength);
      // 各要素が変わっていないこと
      expect(photos[0]).toBe(originalFirst);
      expect(photos[1]).toBe(originalSecond);
      expect(photos[2]).toBe(originalThird);
    });

    it('year=null の場合も photos 配列が mutate されていないこと', () => {
      const photos = [makePhoto('p1', 1970), makePhoto('p2', 1980)];
      const snapshot = [...photos];

      pickPhotoByYear(photos, null, null);

      expect(photos).toEqual(snapshot);
    });
  });

  // -------------------------------------------------------------------------
  // ジェネリック型の保持
  // -------------------------------------------------------------------------
  describe('ジェネリック型の保持', () => {
    it('PhotoForYear を拡張した型を使った場合も正しく動作し型が保持されること', () => {
      interface ExtendedPhoto extends PhotoForYear {
        caption: string;
      }

      const p1: ExtendedPhoto = { id: 'p1', url: 'https://example.com/p1.jpg', takenYear: 1975, caption: '昔の写真' };
      const p2: ExtendedPhoto = { id: 'p2', url: 'https://example.com/p2.jpg', takenYear: 1985, caption: '最近の写真' };
      const photos: ExtendedPhoto[] = [p1, p2];

      const result = pickPhotoByYear(photos, 1984, null);

      // 型アサーション不要で caption にアクセスできること
      expect(result?.caption).toBe('最近の写真');
    });
  });
});
