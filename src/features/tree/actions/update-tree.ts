'use server';

/**
 * updateTree Server Action
 *
 * ツリーのタイトル・説明を更新する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - UPDATE
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { treeUpdateSchema } from '../schemas';

export async function updateTree(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = treeUpdateSchema.safeParse(input);
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

  const { treeId, title, description } = parsed.data;

  const supabase = await createClient();

  // ツリーの存在・所有権確認
  const { data: tree, error: fetchError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', treeId)
    .eq('owner_user_id', session.user.id)
    .single();

  if (fetchError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' },
    };
  }

  // 更新データ構築 (指定されたフィールドのみ)
  const updateData: Record<string, string | null> = {};
  if (title !== undefined) {
    updateData.title = title;
  }
  if (description !== undefined) {
    updateData.description = description;
  }

  const { error: updateError } = await supabase
    .from('tree')
    .update(updateData)
    .eq('id', treeId)
    .eq('owner_user_id', session.user.id);

  if (updateError) {
    console.error('[updateTree] update error:', updateError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリーの更新に失敗しました' },
    };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: undefined };
}
