'use server';

/**
 * registerPhotoAfterUpload Server Action
 *
 * クライアントが署名付き URL で Storage にアップロード後、photo テーブルにメタデータを登録する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - プラン上限チェック (personIds が指定されている場合は最初の person_id を使用)
 * - photo INSERT
 * - photo_person_link INSERT (personIds が指定されている場合)
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { PlanLimitError, assertWithinLimit } from '@/lib/plan/limits';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { registerPhotoAfterUploadSchema } from '../schemas';

export async function registerPhotoAfterUpload(
  input: unknown
): Promise<ActionResult<{ photoId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = registerPhotoAfterUploadSchema.safeParse(input);
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

  const {
    treeId,
    storageObjectKey,
    mimeType,
    byteSize,
    takenYear,
    takenMonth,
    takenDay,
    caption,
    personIds,
  } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // ツリーの存在・所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', treeId)
    .eq('owner_user_id', userId)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' },
    };
  }

  // プラン上限チェック
  // photo の上限は人物単位 (max_photos_per_person)。
  // personIds が指定されている場合、各人物に対してチェックを行う。
  // personIds が未指定の場合はリンクなし写真として上限チェックを省略する。
  if (personIds && personIds.length > 0) {
    for (const personId of personIds) {
      try {
        await assertWithinLimit({ kind: 'photo', userId, personId });
      } catch (err) {
        if (err instanceof PlanLimitError) {
          return {
            ok: false,
            error: {
              code: 'PLAN_LIMIT_EXCEEDED',
              message: err.message,
            },
          };
        }
        console.error('[registerPhotoAfterUpload] limit check error:', err);
        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: '写真の登録に失敗しました' },
        };
      }
    }
  }

  // photo レコード INSERT
  const { data: inserted, error: insertError } = await supabase
    .from('photo')
    .insert({
      tree_id: treeId,
      storage_object_key: storageObjectKey,
      mime_type: mimeType ?? 'image/jpeg',
      byte_size: byteSize ?? null,
      taken_year: takenYear ?? null,
      taken_month: takenMonth ?? null,
      taken_day: takenDay ?? null,
      caption: caption ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[registerPhotoAfterUpload] insert error:', insertError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '写真の登録に失敗しました' },
    };
  }

  const photoId = inserted.id;

  // photo_person_link INSERT (personIds が指定されている場合)
  if (personIds && personIds.length > 0) {
    const links = personIds.map((personId) => ({
      photo_id: photoId,
      person_id: personId,
    }));

    const { error: linkError } = await supabase
      .from('photo_person_link')
      .insert(links);

    if (linkError) {
      console.error('[registerPhotoAfterUpload] link insert error:', linkError);
      // photo は既に挿入済みのため、リンクエラーは警告として扱う
      // (写真自体は登録されているが人物リンクが失敗した状態)
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '写真の人物紐付けに失敗しました' },
      };
    }
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: { photoId } };
}
