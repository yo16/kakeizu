'use server';

/**
 * updateRelation Server Action
 *
 * 既存関係の情報を更新する。
 * - 入力バリデーション (zod)
 * - 認証チェック
 * - ツリー所有権確認
 * - kind に応じたフィールドの更新 (kind 自体の変更は禁止)
 * - 親子の場合: BFS 循環参照チェック (parentRole の更新は循環を引き起こさないが念のため)
 * - revalidatePath
 *
 * api-design.md §3 Relation > updateRelation に準拠。
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { updateRelationSchema, type UpdateRelationInput } from '../schemas';

export async function updateRelation(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = updateRelationSchema.safeParse(input);
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

  const data = parsed.data as UpdateRelationInput;
  const { relationId, kind } = data;

  const supabase = await createClient();

  // 関係レコードの取得とツリー所有権確認 (TOCTOU 対策: tree_id も同時取得)
  const { data: relation, error: relationError } = await supabase
    .from('relation')
    .select('id, tree_id, kind')
    .eq('id', relationId)
    .single();

  if (relationError || !relation) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '関係が見つかりません' },
    };
  }

  // kind の変更は禁止
  if (relation.kind !== kind) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '関係の種別 (kind) は変更できません',
        field: 'kind',
      },
    };
  }

  // ツリーの所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', relation.tree_id)
    .eq('owner_user_id', session.user.id)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' },
    };
  }

  // kind ごとの更新フィールドを組み立て
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};

  if (kind === 'parent_child') {
    if (data.parentRole !== undefined) patch.parent_role = data.parentRole;
    if (data.note !== undefined) patch.note = data.note;
  } else {
    // kind === 'marriage'
    if (data.type !== undefined) patch.marriage_type = data.type;
    if (data.status !== undefined) patch.marriage_status = data.status;
    if (data.startYear !== undefined) patch.start_year = data.startYear ?? null;
    if (data.startMonth !== undefined) patch.start_month = data.startMonth ?? null;
    if (data.endYear !== undefined) patch.end_year = data.endYear ?? null;
    if (data.endMonth !== undefined) patch.end_month = data.endMonth ?? null;
    if (data.note !== undefined) patch.note = data.note;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '更新するフィールドを少なくとも1つ指定してください' },
    };
  }

  // UPDATE (TOCTOU 対策: tree_id も条件に含める)
  const { error: updateError, data: updated } = await supabase
    .from('relation')
    .update(patch)
    .eq('id', relationId)
    .eq('tree_id', relation.tree_id)
    .select('id');

  if (updateError) {
    console.error('[updateRelation] update error:', updateError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の更新に失敗しました' },
    };
  }

  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '関係が見つかりません' },
    };
  }

  revalidatePath(`/dashboard/trees/${relation.tree_id}`);

  return { ok: true, data: undefined };
}
