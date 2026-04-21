'use server';

/**
 * deleteRelation Server Action
 *
 * 関係を削除する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - DELETE (TOCTOU 対策: tree_id も条件に含める)
 * - revalidatePath
 *
 * api-design.md §3 Relation > deleteRelation に準拠。
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { deleteRelationSchema } from '../schemas';

export async function deleteRelation(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = deleteRelationSchema.safeParse(input);
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

  const { relationId } = parsed.data;

  const supabase = await createClient();

  // 関係レコードの取得とツリーID確認
  const { data: relation, error: relationError } = await supabase
    .from('relation')
    .select('id, tree_id')
    .eq('id', relationId)
    .single();

  if (relationError || !relation) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '関係が見つかりません' },
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

  // DELETE (TOCTOU 対策: tree_id も条件に含める)
  const { error: deleteError, count } = await supabase
    .from('relation')
    .delete({ count: 'exact' })
    .eq('id', relationId)
    .eq('tree_id', relation.tree_id);

  if (deleteError) {
    console.error('[deleteRelation] delete error:', deleteError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の削除に失敗しました' },
    };
  }

  if ((count ?? 0) === 0) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '関係が見つかりません' },
    };
  }

  revalidatePath(`/dashboard/trees/${relation.tree_id}`);

  return { ok: true, data: undefined };
}
