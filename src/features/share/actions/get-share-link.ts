'use server';

/**
 * getShareLink Server Action
 *
 * treeId に対して有効な共有リンクを取得する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - is_enabled=true の share_link を maybeSingle() で取得
 * - RLS により tree owner のみ取得可能
 * - 戻り値: ShareLink (有効なリンクあり) または null (なし)
 */
import { z } from 'zod';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import type { ShareLink } from './createShareLink';

const getShareLinkSchema = z.object({
  treeId: z.string().uuid({ message: '有効なツリーIDを指定してください' }),
});

export async function getShareLink(
  input: unknown
): Promise<ActionResult<ShareLink | null>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = getShareLinkSchema.safeParse(input);
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

  const { data, error } = await supabase
    .from('share_link')
    .select('id, tree_id, token, is_enabled, created_at')
    .eq('tree_id', treeId)
    .eq('is_enabled', true)
    .maybeSingle();

  if (error) {
    console.error('[getShareLink] select error:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '共有リンクの取得に失敗しました',
      },
    };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      treeId: data.tree_id,
      token: data.token,
      isEnabled: data.is_enabled,
      createdAt: data.created_at,
    },
  };
}
