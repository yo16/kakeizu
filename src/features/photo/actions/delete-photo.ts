'use server';

/**
 * deletePhoto Server Action
 *
 * 写真を削除する。Storage オブジェクト削除後に DB レコードを削除する。
 * Storage 削除失敗時は DB も残す（整合性優先）。
 * photo_person_link は ON DELETE CASCADE で自動削除される。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 写真の取得とツリー所有権確認 (JOIN で一クエリに統合、確認済み tree_id で TOCTOU対策)
 * - Storage オブジェクト削除
 * - photo レコード削除 (count: 'exact' で 0件削除を検出)
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { deletePhotoSchema } from '../schemas';

export async function deletePhoto(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = deletePhotoSchema.safeParse(input);
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

  const { photoId } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // 写真の取得と所有権確認を JOIN で一度に行い、確認済み tree_id と storage_object_key を取得する
  const { data: photo, error: fetchError } = await supabase
    .from('photo')
    .select('tree_id, storage_object_key, tree!inner(owner_user_id)')
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
  const storageObjectKey = photo.storage_object_key;

  // Storage オブジェクト削除 (整合性優先: Storage 削除失敗時は DB も残す)
  const { error: storageError } = await supabase.storage
    .from('photos')
    .remove([storageObjectKey]);

  if (storageError) {
    console.error('[deletePhoto] Storage delete error:', storageError);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'ファイルの削除に失敗しました。しばらく時間をおいて再試行してください。',
      },
    };
  }

  // TOCTOU対策: 確認済みの tree_id で絞り込み、0件削除を count で検出する
  const { error: deleteError, count } = await supabase
    .from('photo')
    .delete({ count: 'exact' })
    .eq('id', photoId)
    .eq('tree_id', treeId);

  if (deleteError || count === 0) {
    console.error('[deletePhoto] DB delete error:', deleteError);
    // Storage は削除済みだが DB が残っている状態 (オーファン)
    // この状態は運用上問題があるため INTERNAL_ERROR を返す
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '写真の削除に失敗しました。管理者にお問い合わせください。',
      },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
