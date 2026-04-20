'use server';

/**
 * deletePerson Server Action
 *
 * 人物を削除する。
 * relation, photo_person_link は ON DELETE CASCADE で自動削除される。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 人物の取得とツリー所有権確認
 * - DELETE (TOCTOU対策: in() で owner フィルタ付与)
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { deletePersonSchema } from '../schemas';

export async function deletePerson(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = deletePersonSchema.safeParse(input);
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

  const { personId } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // 人物の取得
  const { data: person, error: fetchError } = await supabase
    .from('person')
    .select('id, tree_id')
    .eq('id', personId)
    .single();

  if (fetchError || !person) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
    };
  }

  // ツリーの所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', person.tree_id)
    .eq('owner_user_id', userId)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'この人物へのアクセス権がありません' },
    };
  }

  const treeId = person.tree_id;

  // TOCTOU対策: in() で自分のツリーに属する person のみ削除
  const { data: ownerTreeIds } = await supabase
    .from('tree')
    .select('id')
    .eq('owner_user_id', userId);

  const { error: deleteError } = await supabase
    .from('person')
    .delete()
    .eq('id', personId)
    .in('tree_id', ownerTreeIds?.map((t) => t.id) ?? []);

  if (deleteError) {
    console.error('[deletePerson] delete error:', deleteError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の削除に失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
