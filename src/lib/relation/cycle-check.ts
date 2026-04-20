/**
 * BFS 循環参照チェック
 *
 * 親子関係に循環が生じないかを BFS で検査するユーティリティ。
 * create-parent-child.ts からロジックを抽出・共通化したもの。
 *
 * db-design.md §2.7 の「循環参照 (祖先ループ) はアプリ層 (Server Action) で BFS チェック後に INSERT」
 * という方針に準拠する。
 */
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BFS で startPersonId の子孫に targetPersonId が含まれるか判定する。
 *
 * 新たに (parentId → childId) の親子関係を作成しようとするとき、
 * - startPersonId = childId (追加しようとする子)
 * - targetPersonId = parentId (追加しようとする親)
 * で呼び出すことで、循環参照を検出できる。
 *
 * @param supabase - Supabase クライアント
 * @param startPersonId - 探索の起点 (追加しようとする子)
 * @param targetPersonId - 循環対象 (追加しようとする親)
 * @param treeId - ツリー ID (ツリーを跨いだ探索を防ぐ)
 * @returns true: 循環あり (関係を作成してはいけない) / false: 循環なし
 */
export async function checkAncestorLoop(
  supabase: SupabaseClient,
  startPersonId: string,
  targetPersonId: string,
  treeId: string
): Promise<boolean> {
  const visited = new Set<string>();
  const queue: string[] = [startPersonId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // current を親とする関係を取得 (from=current, kind=parent_child → to が子)
    const { data: children } = await supabase
      .from('relation')
      .select('to_person_id')
      .eq('from_person_id', current)
      .eq('kind', 'parent_child')
      .eq('tree_id', treeId);

    for (const row of children ?? []) {
      const childId = row.to_person_id as string;
      if (childId === targetPersonId) return true;
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return false;
}
