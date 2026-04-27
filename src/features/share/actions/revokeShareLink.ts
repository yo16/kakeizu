'use server';

/**
 * revokeShareLink Server Action
 *
 * 共有リンクを無効化する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - is_enabled=false, revoked_at=now() に UPDATE
 * - RLS により share_link の tree_id に紐づく tree の owner のみ操作可能
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { revokeShareLinkSchema } from '../schemas';

export async function revokeShareLink(
  input: unknown
): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = revokeShareLinkSchema.safeParse(input);
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

  const { linkId } = parsed.data;
  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from('share_link')
    .update({
      is_enabled: false,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select('id');

  if (updateError) {
    console.error('[revokeShareLink] update error:', updateError);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '共有リンクの無効化に失敗しました',
      },
    };
  }

  // RLS により対象レコードが存在しない、または権限がない場合は updated が空配列
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: '共有リンクが見つからないか、アクセス権がありません',
      },
    };
  }

  return { ok: true, data: undefined };
}
