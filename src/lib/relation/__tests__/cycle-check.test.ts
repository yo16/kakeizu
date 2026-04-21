/**
 * checkAncestorLoop のユニットテスト
 *
 * Supabase クライアントをモックし、BFS 循環参照チェックの動作を検証する。
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

import { checkAncestorLoop } from '../cycle-check';

// テスト用 UUID
const A_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const B_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const C_ID = 'aaaaaaaa-0000-0000-0000-000000000003';
const D_ID = 'aaaaaaaa-0000-0000-0000-000000000004';
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

/**
 * BFS クエリ (from('relation').select(...).eq(...).eq(...).eq(...)) を
 * 呼び出しごとに異なるデータを返すモック Supabase クライアントを生成する。
 *
 * queries は [personId, children[]] の配列。BFS が personId を処理するたびに
 * 対応する children 配列を返す。
 */
function buildSupabaseMock(
  queryResults: Array<{ data: Array<{ to_person_id: string }> }>
) {
  let callIndex = 0;

  const buildQueryChain = () => {
    const currentIndex = callIndex++;
    const result = queryResults[currentIndex] ?? { data: [] };

    // BFS は直接 await するため thenable なオブジェクトを返す
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);

    // Promise として解決できるよう then を定義
    const promise = Promise.resolve(result);
    Object.defineProperty(chain, 'then', {
      get: () => promise.then.bind(promise),
      configurable: true,
    });
    Object.defineProperty(chain, 'catch', {
      get: () => promise.catch.bind(promise),
      configurable: true,
    });
    Object.defineProperty(chain, 'finally', {
      get: () => promise.finally.bind(promise),
      configurable: true,
    });

    return chain;
  };

  const from = jest.fn(() => buildQueryChain());

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('checkAncestorLoop', () => {
  // -------------------------------------------------------------------------
  // 空グラフ
  // -------------------------------------------------------------------------
  describe('空のグラフ', () => {
    it('関係が存在しない場合 false を返すこと', async () => {
      // startPersonId の子が空 → 循環なし
      const supabase = buildSupabaseMock([{ data: [] }]);

      const result = await checkAncestorLoop(supabase, A_ID, B_ID, TREE_ID);

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 直接循環 (A→B が既存、start=B, target=A)
  // -------------------------------------------------------------------------
  describe('直接循環 (1ステップ)', () => {
    it('start=B, target=A で B の子が A の場合 true を返すこと', async () => {
      // B の子として A が返る → targetPersonId=A と一致 → 循環検出
      const supabase = buildSupabaseMock([
        { data: [{ to_person_id: A_ID }] }, // B の子 → A
      ]);

      const result = await checkAncestorLoop(supabase, B_ID, A_ID, TREE_ID);

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 多段循環 (A→B→C が既存、start=C, target=A)
  // -------------------------------------------------------------------------
  describe('多段循環 (2ステップ)', () => {
    it('A→B→C が既存で start=C, target=A の場合 true を返すこと', async () => {
      // C の子として B、B の子として A が返る
      const supabase = buildSupabaseMock([
        { data: [{ to_person_id: B_ID }] }, // C の子 → B
        { data: [{ to_person_id: A_ID }] }, // B の子 → A (= targetPersonId → 循環検出)
      ]);

      const result = await checkAncestorLoop(supabase, C_ID, A_ID, TREE_ID);

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // ダイヤモンド構造 (A→B, A→C, B→D, C→D、start=D, target=A)
  // -------------------------------------------------------------------------
  describe('ダイヤモンド構造で循環検出', () => {
    it('start=D, target=A で A→B, A→C, B→D, C→D 構造の場合 true を返すこと', async () => {
      // D の子として A (= targetPersonId → 即循環検出)
      // ※ ここでは D→A の直接関係がある場合を検証
      const supabase = buildSupabaseMock([
        { data: [{ to_person_id: A_ID }] }, // D の子 → A
      ]);

      const result = await checkAncestorLoop(supabase, D_ID, A_ID, TREE_ID);

      expect(result).toBe(true);
    });

    it('A→B, A→C, B→D, C→D 構造で start=A, target=D の場合 true を返すこと', async () => {
      // A の子 → B, C
      // B の子 → D (= targetPersonId → 循環検出)
      const supabase = buildSupabaseMock([
        { data: [{ to_person_id: B_ID }, { to_person_id: C_ID }] }, // A の子
        { data: [{ to_person_id: D_ID }] },                          // B の子 → D (循環検出)
      ]);

      const result = await checkAncestorLoop(supabase, A_ID, D_ID, TREE_ID);

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // ダイヤモンド構造で重複訪問防止 (visited セット)
  // -------------------------------------------------------------------------
  describe('ダイヤモンド構造: visited による重複訪問防止', () => {
    it('A→B, A→C, B→D, C→D 構造で D が 2 回訪問されないこと', async () => {
      // A の子 → B, C
      // B の子 → D
      // C の子 → D (D は visited に追加済みのため queue に追加されない)
      // D の子 → なし
      // 結果: target=E (存在しない) なので false
      const E_ID = 'aaaaaaaa-0000-0000-0000-000000000005';

      const queryResults: Array<{ data: Array<{ to_person_id: string }> }> = [
        { data: [{ to_person_id: B_ID }, { to_person_id: C_ID }] }, // A の子
        { data: [{ to_person_id: D_ID }] },                          // B の子
        { data: [{ to_person_id: D_ID }] },                          // C の子 (D は visited)
        { data: [] },                                                  // D の子
      ];

      let queryCallCount = 0;
      const from = jest.fn(() => {
        const currentIndex = queryCallCount++;
        const result = queryResults[currentIndex] ?? { data: [] };
        const chain: Record<string, unknown> = {};
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        const promise = Promise.resolve(result);
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });
        Object.defineProperty(chain, 'catch', {
          get: () => promise.catch.bind(promise),
          configurable: true,
        });
        Object.defineProperty(chain, 'finally', {
          get: () => promise.finally.bind(promise),
          configurable: true,
        });
        return chain;
      });

      const supabase = { from } as unknown as import('@supabase/supabase-js').SupabaseClient;

      const result = await checkAncestorLoop(supabase, A_ID, E_ID, TREE_ID);

      expect(result).toBe(false);
      // D は visited により 2 回目は queue に追加されないため、
      // クエリ呼び出しは 4 回以内 (A, B, C, D 各 1 回)
      expect(queryCallCount).toBeLessThanOrEqual(4);
    });
  });

  // -------------------------------------------------------------------------
  // 循環なし (正常ツリー)
  // -------------------------------------------------------------------------
  describe('循環なし', () => {
    it('start と target が直接・間接的に繋がっていない場合 false を返すこと', async () => {
      // A の子 → B, C
      // B の子 → なし
      // C の子 → なし
      // target = D (グラフに存在しない) → false
      const supabase = buildSupabaseMock([
        { data: [{ to_person_id: B_ID }, { to_person_id: C_ID }] }, // A の子
        { data: [] },                                                  // B の子
        { data: [] },                                                  // C の子
      ]);

      const result = await checkAncestorLoop(supabase, A_ID, D_ID, TREE_ID);

      expect(result).toBe(false);
    });

    it('start と target が同じでも直接子がいなければ false を返すこと', async () => {
      // start = A, target = A だが A の子は空
      const supabase = buildSupabaseMock([
        { data: [] }, // A の子 → なし
      ]);

      const result = await checkAncestorLoop(supabase, A_ID, A_ID, TREE_ID);

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // DB エラー
  // -------------------------------------------------------------------------
  describe('DB エラー', () => {
    it('DB クエリがエラーを返した場合も処理が停止しないこと', async () => {
      // data が null の場合 (エラー相当)、空配列として扱われるため false を返す
      const from = jest.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.select = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        const promise = Promise.resolve({ data: null, error: { message: 'DB error' } });
        Object.defineProperty(chain, 'then', {
          get: () => promise.then.bind(promise),
          configurable: true,
        });
        Object.defineProperty(chain, 'catch', {
          get: () => promise.catch.bind(promise),
          configurable: true,
        });
        Object.defineProperty(chain, 'finally', {
          get: () => promise.finally.bind(promise),
          configurable: true,
        });
        return chain;
      });

      const supabase = { from } as unknown as import('@supabase/supabase-js').SupabaseClient;

      // data が null の場合、`children ?? []` で空配列として扱われ false を返す
      const result = await checkAncestorLoop(supabase, A_ID, B_ID, TREE_ID);

      expect(result).toBe(false);
    });
  });
});
