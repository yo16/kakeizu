'use server';

/**
 * setPrimaryPhoto Server Action
 *
 * 人物の代表写真を設定する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 人物の取得とツリー所有権確認 (JOIN で一クエリに統合、確認済み tree_id で TOCTOU対策)
 * - 指定した photoId が person の photo_person_link に存在することを検証
 * - person.primary_photo_id を更新
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { setPrimaryPhotoSchema } from '../schemas';

export async function setPrimaryPhoto(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = setPrimaryPhotoSchema.safeParse(input);
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

  const { personId, photoId } = parsed.data;
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

  // 指定した photo が person の photo_person_link に存在することを検証
  const { data: link, error: linkError } = await supabase
    .from('photo_person_link')
    .select('photo_id')
    .eq('person_id', personId)
    .eq('photo_id', photoId)
    .single();

  if (linkError || !link) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: '指定した写真はこの人物に紐付いていません',
      },
    };
  }

  // TOCTOU対策: 確認済みの tree_id で絞り込み、0件更新を count で検出する
  const { error: updateError, count } = await supabase
    .from('person')
    .update({ primary_photo_id: photoId }, { count: 'exact' })
    .eq('id', personId)
    .eq('tree_id', person.tree_id);

  if (updateError || count === 0) {
    console.error('[setPrimaryPhoto] update error:', updateError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '代表写真の設定に失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${person.tree_id}`);

  return { ok: true, data: undefined };
}
