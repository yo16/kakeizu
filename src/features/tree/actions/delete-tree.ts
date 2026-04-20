'use server';

/**
 * deleteTree Server Action
 *
 * ツリーを削除する。人物・関係・写真メタは ON DELETE CASCADE で連動削除される。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - DELETE
 *
 * NOTE: Storage 上の写真ファイル削除は photo テーブル削除トリガーまたは後続タスクで対応予定。
 * このアクションでは tree の DELETE のみ行う。
 */
import { z } from 'zod';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

const deleteTreeSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

export async function deleteTree(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = deleteTreeSchema.safeParse(input);
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

  // TODO: Storage 上の写真ファイル削除は後続タスクで対応。
  // photo テーブル削除トリガーまたは別途の cleanup タスクで処理する。

  const { error: deleteError } = await supabase
    .from('tree')
    .delete()
    .eq('id', treeId);

  if (deleteError) {
    console.error('[deleteTree] delete error:', deleteError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリーの削除に失敗しました' },
    };
  }

  return { ok: true, data: undefined };
}
