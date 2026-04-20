'use server';

/**
 * createParentChild Server Action
 *
 * 既存の2人物間に親子関係を作成する。
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - 循環参照チェック (BFS)
 * - 重複チェック (DB UNIQUE 制約 + アプリ層プリチェック)
 * - INSERT
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';
import { createParentChildSchema, type CreateParentChildInput } from '../schemas';

export async function createParentChild(
  input: unknown
): Promise<ActionResult<{ relationId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = createParentChildSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstError.message,
        field: firstError.path[0]?.toString(),
      },
    };
  }

  const { parentId, childId, parentRole, note } = parsed.data as CreateParentChildInput;

  if (parentId === childId) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '同じ人物を指定できません', field: 'childId' },
    };
  }

  const supabase = await createClient();

  // 親人物のツリーIDを取得し、ユーザーの所有権確認
  const { data: parentPerson, error: parentError } = await supabase
    .from('person')
    .select('tree_id')
    .eq('id', parentId)
    .single();

  if (parentError || !parentPerson) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '親人物が見つかりません' },
    };
  }

  const treeId = parentPerson.tree_id;

  // ツリーの所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', treeId)
    .eq('owner_user_id', session.user.id)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' },
    };
  }

  // 子人物が同じツリーに属しているか確認
  const { data: childPerson, error: childError } = await supabase
    .from('person')
    .select('tree_id')
    .eq('id', childId)
    .eq('tree_id', treeId)
    .single();

  if (childError || !childPerson) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '子人物が見つかりません (同一ツリー内でのみ関係を作成できます)' },
    };
  }

  // 重複チェック: 同じペア・同じ親役割が既に存在するか
  const { data: existing } = await supabase
    .from('relation')
    .select('id')
    .eq('from_person_id', parentId)
    .eq('to_person_id', childId)
    .eq('parent_role', parentRole)
    .eq('kind', 'parent_child')
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error: {
        code: 'RELATION_CONFLICT',
        message: 'この2人の間には既に同じ親子関係が存在します',
      },
    };
  }

  // 循環参照チェック: childId の子孫に parentId が含まれていないか (BFS)
  const hasAncestorLoop = await checkAncestorLoop(supabase, childId, parentId, treeId);
  if (hasAncestorLoop) {
    return {
      ok: false,
      error: {
        code: 'RELATION_CONFLICT',
        message: '循環した親子関係が生じるため、この関係を作成できません',
      },
    };
  }

  // INSERT
  const { data: inserted, error: insertError } = await supabase
    .from('relation')
    .insert({
      tree_id: treeId,
      kind: 'parent_child',
      from_person_id: parentId,
      to_person_id: childId,
      parent_role: parentRole,
      note: note ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[createParentChild] insert error:', insertError);
    // DB UNIQUE 制約違反の場合
    if (insertError?.code === '23505') {
      return {
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: 'この2人の間には既に同じ親子関係が存在します',
        },
      };
    }
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の作成に失敗しました' },
    };
  }

  return { ok: true, data: { relationId: inserted.id } };
}

/**
 * BFS で startPersonId の子孫に targetPersonId が含まれるか判定する。
 * true: 循環あり (関係を作成してはいけない)
 */
async function checkAncestorLoop(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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
