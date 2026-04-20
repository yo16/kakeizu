'use server';

/**
 * getTreeOverview Server Action
 *
 * ツリーの一覧用サマリ（tree + 人物数・写真数）を取得する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - tree + person 数 + photo 数を取得
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { getTreeOverviewSchema } from '../schemas';

export interface TreeOverview {
  tree: {
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  counts: {
    persons: number;
    photos: number;
  };
}

export async function getTreeOverview(
  input: unknown
): Promise<ActionResult<TreeOverview>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = getTreeOverviewSchema.safeParse(input);
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
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id, title, description, created_at, updated_at')
    .eq('id', treeId)
    .eq('owner_user_id', session.user.id)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'ツリーが見つかりません' },
    };
  }

  // 人物数を取得
  const { count: personCount, error: personError } = await supabase
    .from('person')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId);

  if (personError) {
    console.error('[getTreeOverview] person count error:', personError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリー情報の取得に失敗しました' },
    };
  }

  // 写真数を取得
  const { count: photoCount, error: photoError } = await supabase
    .from('photo')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId);

  if (photoError) {
    console.error('[getTreeOverview] photo count error:', photoError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリー情報の取得に失敗しました' },
    };
  }

  return {
    ok: true,
    data: {
      tree: {
        id: tree.id,
        title: tree.title,
        description: tree.description,
        createdAt: tree.created_at,
        updatedAt: tree.updated_at,
      },
      counts: {
        persons: personCount ?? 0,
        photos: photoCount ?? 0,
      },
    },
  };
}
