'use server';

/**
 * updatePhotoMeta Server Action
 *
 * 写真のメタデータ（caption, taken_at 等）を更新する。
 * personIds が指定された場合は photo_person_link を洗い替えする。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 写真の取得とツリー所有権確認 (JOIN で一クエリに統合、確認済み tree_id で TOCTOU対策)
 * - UPDATE (count: 'exact' で 0件更新を検出)
 * - photo_person_link の洗い替え (personIds が指定された場合)
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { updatePhotoMetaSchema } from '../schemas';

export async function updatePhotoMeta(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = updatePhotoMetaSchema.safeParse(input);
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

  const { photoId, takenYear, takenMonth, takenDay, caption, personIds } = parsed.data;
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

  // 更新データ構築 (指定されたフィールドのみ)
  const updateData: Record<string, unknown> = {};

  if (takenYear !== undefined) {
    updateData.taken_year = takenYear;
  }
  if (takenMonth !== undefined) {
    updateData.taken_month = takenMonth;
  }
  if (takenDay !== undefined) {
    updateData.taken_day = takenDay;
  }
  if (caption !== undefined) {
    updateData.caption = caption;
  }

  // メタデータの更新がある場合のみ UPDATE を実行
  if (Object.keys(updateData).length > 0) {
    // TOCTOU対策: 確認済みの tree_id で絞り込み、0件更新を count で検出する
    const { error: updateError, count } = await supabase
      .from('photo')
      .update(updateData, { count: 'exact' })
      .eq('id', photoId)
      .eq('tree_id', treeId);

    if (updateError || count === 0) {
      console.error('[updatePhotoMeta] update error:', updateError);
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '写真の更新に失敗しました' },
      };
    }
  }

  // personIds が指定された場合は photo_person_link を洗い替えする
  if (personIds !== undefined) {
    // personIds が空でない場合、それらが同じツリーに属する person であることを検証する
    if (personIds.length > 0) {
      const { data: personsInTree, error: personsError } = await supabase
        .from('person')
        .select('id')
        .eq('tree_id', treeId)
        .in('id', personIds);

      if (personsError) {
        console.error('[updatePhotoMeta] person ownership check error:', personsError);
        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: '写真の更新に失敗しました' },
        };
      }

      if (!personsInTree || personsInTree.length !== personIds.length) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: '他ツリーの人物は指定できません' },
        };
      }
    }

    // 既存リンクを削除
    const { error: deleteLinksError } = await supabase
      .from('photo_person_link')
      .delete()
      .eq('photo_id', photoId);

    if (deleteLinksError) {
      console.error('[updatePhotoMeta] delete links error:', deleteLinksError);
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '写真の人物紐付け更新に失敗しました' },
      };
    }

    // 新しいリンクを挿入
    if (personIds.length > 0) {
      const links = personIds.map((personId) => ({
        photo_id: photoId,
        person_id: personId,
      }));

      const { error: insertLinksError } = await supabase
        .from('photo_person_link')
        .insert(links);

      if (insertLinksError) {
        console.error('[updatePhotoMeta] insert links error:', insertLinksError);
        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: '写真の人物紐付け更新に失敗しました' },
        };
      }
    }
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
