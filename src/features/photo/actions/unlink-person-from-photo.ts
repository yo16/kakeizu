'use server';

import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { unlinkPersonFromPhotoSchema } from '../schemas';

export async function unlinkPersonFromPhoto(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = unlinkPersonFromPhotoSchema.safeParse(input);
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

  const { photoId, personId } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // 写真の取得と所有権確認を JOIN で一度に行い、確認済み tree_id を取得する
  const { data: photo, error: fetchError } = await supabase
    .from('photo')
    .select('tree_id, tree!inner(owner_user_id)')
    .eq('id', photoId)
    .eq('tree.owner_user_id', userId)
    .single();

  if (fetchError || !photo) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '写真が見つかりません' },
    };
  }

  const treeId = photo.tree_id;

  // photo_person_link DELETE
  const { error: deleteError, count } = await supabase
    .from('photo_person_link')
    .delete({ count: 'exact' })
    .eq('photo_id', photoId)
    .eq('person_id', personId);

  if (deleteError) {
    console.error('[unlinkPersonFromPhoto] delete error:', deleteError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の紐付け解除に失敗しました' },
    };
  }

  if (count === 0) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'この人物は紐付けられていません' },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
