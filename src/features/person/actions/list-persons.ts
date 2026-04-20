'use server';

/**
 * listPersons Server Action
 *
 * ツリー内の全人物一覧を全フィールドで取得する。
 * (getPersonsByTree との違い: こちらは全フィールドを返す。
 *  getPersonsByTree は RelationDialog 用の軽量版 PersonSummary のみ返す)
 *
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - SELECT all fields
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { type Person } from './get-person';
import { listPersonsSchema } from '../schemas';

export async function listPersons(
  input: unknown
): Promise<ActionResult<Person[]>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = listPersonsSchema.safeParse(input);
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

  const { data: persons, error } = await supabase
    .from('person')
    .select('id, tree_id, display_name, family_name, given_name, maiden_name, gender, birth_year, birth_month, birth_day, birth_place, death_year, death_month, death_day, death_place, is_alive, note, primary_photo_id, created_at, updated_at')
    .eq('tree_id', treeId)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[listPersons] error:', error);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物一覧の取得に失敗しました' },
    };
  }

  return {
    ok: true,
    data: (persons ?? []).map((p) => ({
      id: p.id,
      treeId: p.tree_id,
      displayName: p.display_name,
      familyName: p.family_name ?? null,
      givenName: p.given_name ?? null,
      maidenName: p.maiden_name ?? null,
      gender: p.gender ?? null,
      birthYear: p.birth_year ?? null,
      birthMonth: p.birth_month ?? null,
      birthDay: p.birth_day ?? null,
      birthPlace: p.birth_place ?? null,
      deathYear: p.death_year ?? null,
      deathMonth: p.death_month ?? null,
      deathDay: p.death_day ?? null,
      deathPlace: p.death_place ?? null,
      isAlive: p.is_alive,
      note: p.note ?? null,
      primaryPhotoId: p.primary_photo_id ?? null,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  };
}
