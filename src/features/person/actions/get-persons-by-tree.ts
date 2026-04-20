'use server';

/**
 * getPersonsByTree Server Action
 *
 * ツリー内の全人物一覧を取得する。
 * RelationDialog での人物検索に使用する。
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

export interface PersonSummary {
  id: string;
  displayName: string;
  birthYear: number | null;
  gender: string | null;
}

export async function getPersonsByTree(
  treeId: string
): Promise<ActionResult<PersonSummary[]>> {
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  const supabase = await createClient();

  // ツリーの所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', treeId)
    .eq('owner_user_id', session.user.id)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'このツリーへのアクセス権がありません' },
    };
  }

  const { data: persons, error } = await supabase
    .from('person')
    .select('id, display_name, birth_year, gender')
    .eq('tree_id', treeId)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[getPersonsByTree] error:', error);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物一覧の取得に失敗しました' },
    };
  }

  return {
    ok: true,
    data: (persons ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      birthYear: p.birth_year ?? null,
      gender: p.gender ?? null,
    })),
  };
}
