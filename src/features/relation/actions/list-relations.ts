'use server';

/**
 * listRelations Server Action
 *
 * ツリー内のすべての関係を取得する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - SELECT
 *
 * api-design.md §3 Relation に準拠。
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { listRelationsSchema } from '../schemas';

export interface RelationRow {
  id: string;
  treeId: string;
  kind: 'parent_child' | 'marriage';
  fromPersonId: string;
  toPersonId: string;
  parentRole: string | null;
  marriageType: string | null;
  marriageStatus: string | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  note: string | null;
  createdAt: string;
}

export async function listRelations(
  input: unknown
): Promise<ActionResult<{ relations: RelationRow[] }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = listRelationsSchema.safeParse(input);
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

  // SELECT
  const { data: rows, error: selectError } = await supabase
    .from('relation')
    .select(
      'id, tree_id, kind, from_person_id, to_person_id, parent_role, marriage_type, marriage_status, start_year, start_month, end_year, end_month, note, created_at'
    )
    .eq('tree_id', treeId)
    .order('created_at', { ascending: true });

  if (selectError) {
    console.error('[listRelations] select error:', selectError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の取得に失敗しました' },
    };
  }

  const relations: RelationRow[] = (rows ?? []).map((row) => ({
    id: row.id,
    treeId: row.tree_id,
    kind: row.kind as 'parent_child' | 'marriage',
    fromPersonId: row.from_person_id,
    toPersonId: row.to_person_id,
    parentRole: row.parent_role ?? null,
    marriageType: row.marriage_type ?? null,
    marriageStatus: row.marriage_status ?? null,
    startYear: row.start_year ?? null,
    startMonth: row.start_month ?? null,
    endYear: row.end_year ?? null,
    endMonth: row.end_month ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  }));

  return { ok: true, data: { relations } };
}
