'use server';

/**
 * getPhotos Server Action
 *
 * ツリー内の写真一覧を取得する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - photo テーブルから treeId で一覧取得
 * - photo_person_link も合わせて取得
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { getPhotosSchema } from '../schemas';

/** 写真一覧の各エントリ */
export interface PhotoSummary {
  id: string;
  storageObjectKey: string;
  mimeType: string | null;
  byteSize: number | null;
  takenYear: number | null;
  takenMonth: number | null;
  takenDay: number | null;
  caption: string | null;
  personIds: string[];
  createdAt: string;
}

export async function getPhotos(
  input: unknown
): Promise<ActionResult<PhotoSummary[]>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = getPhotosSchema.safeParse(input);
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

  const { treeId } = parsed.data;
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

  // 写真一覧取得 (photo_person_link も同時取得)
  const { data: photos, error: photosError } = await supabase
    .from('photo')
    .select(
      `
      id,
      storage_object_key,
      mime_type,
      byte_size,
      taken_year,
      taken_month,
      taken_day,
      caption,
      created_at,
      photo_person_link (
        person_id
      )
    `
    )
    .eq('tree_id', treeId)
    .order('created_at', { ascending: false });

  if (photosError) {
    console.error('[getPhotos] fetch error:', photosError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '写真一覧の取得に失敗しました' },
    };
  }

  return {
    ok: true,
    data: (photos ?? []).map((p) => ({
      id: p.id,
      storageObjectKey: p.storage_object_key,
      mimeType: p.mime_type ?? null,
      byteSize: p.byte_size ?? null,
      takenYear: p.taken_year ?? null,
      takenMonth: p.taken_month ?? null,
      takenDay: p.taken_day ?? null,
      caption: p.caption ?? null,
      personIds: (p.photo_person_link ?? []).map((link) => link.person_id),
      createdAt: p.created_at,
    })),
  };
}
