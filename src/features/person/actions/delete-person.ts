'use server';

/**
 * deletePerson Server Action
 *
 * 人物を削除する。
 * relation, photo_person_link は ON DELETE CASCADE で自動削除される。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 人物の取得とツリー所有権確認 (JOIN で一クエリに統合、確認済み tree_id で TOCTOU対策)
 * - DELETE (count: 'exact' で 0件削除を検出)
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

  // 人物の取得と所有権確認を JOIN で一度に行い、確認済み tree_id を取得する
  const { data: person, error: fetchError } = await supabase
    .from('person')
    .select('tree_id, tree!inner(owner_user_id)')
    .eq('id', personId)
    .eq('tree.owner_user_id', userId)
    .single();

  if (fetchError || !person) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
    };
  }

  const treeId = person.tree_id;

  // TOCTOU対策: 確認済みの tree_id で絞り込み、0件削除を count で検出する
  const { error: deleteError, count } = await supabase
    .from('person')
    .delete({ count: 'exact' })
    .eq('id', personId)
    .eq('tree_id', treeId);

  if (deleteError || count === 0) {
    console.error('[deletePerson] delete error:', deleteError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の削除に失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
