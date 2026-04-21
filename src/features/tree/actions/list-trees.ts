'use server';

/**
 * listTrees — ログインユーザーのツリー一覧取得
 *
 * 注: Beads タスク kakeizu-419.1 の要件に基づき実装。
 * api-design.md §3 Tree には未記載のため、設計書の更新が必要（別タスクで対応）。
 *
 * - 認証チェック
 * - owner_user_id でフィルタしてツリー一覧を返す
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

export interface TreeListItem {
  id: string;
  title: string;
  description: string | null;
  personCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listTrees(): Promise<ActionResult<TreeListItem[]>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  const supabase = await createClient();

  const { data: trees, error } = await supabase
    .from('tree')
    .select('id, title, description, created_at, updated_at, person(count)')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listTrees] fetch error:', error);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリー一覧の取得に失敗しました' },
    };
  }

  return {
    ok: true,
    data: (trees ?? []).map((tree) => {
      const personCountRaw = tree.person;
      const personCount = Array.isArray(personCountRaw)
        ? (personCountRaw[0] as { count: number } | undefined)?.count ?? 0
        : 0;
      return {
        id: tree.id,
        title: tree.title,
        description: tree.description,
        personCount,
        createdAt: tree.created_at,
        updatedAt: tree.updated_at,
      };
    }),
  };
}
