'use server';

import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { linkPersonToPhotoSchema } from '../schemas';

export async function linkPersonToPhoto(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = linkPersonToPhotoSchema.safeParse(input);
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

  const { photoId, personId, treeId } = parsed.data;
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

  // person が同ツリー所属か確認
  const { data: person, error: personError } = await supabase
    .from('person')
    .select('id')
    .eq('tree_id', treeId)
    .eq('id', personId)
    .single();

  if (personError || !person) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: '他ツリーの人物は指定できません' },
    };
  }

  // photo が同ツリー所属か確認
  const { data: photo, error: photoError } = await supabase
    .from('photo')
    .select('id')
    .eq('id', photoId)
    .eq('tree_id', treeId)
    .single();

  if (photoError || !photo) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '写真が見つかりません' },
    };
  }

  // photo_person_link INSERT
  const { error: linkError } = await supabase
    .from('photo_person_link')
    .insert({ photo_id: photoId, person_id: personId });

  if (linkError) {
    if (linkError.code === '23505') {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'この人物はすでに紐付けられています' },
      };
    }
    console.error('[linkPersonToPhoto] insert error:', linkError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の紐付けに失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
