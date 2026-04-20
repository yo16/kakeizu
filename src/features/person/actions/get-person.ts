'use server';

/**
 * getPerson Server Action
 *
 * 人物を単体取得する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 人物の取得とツリー所有権確認 (JOIN で一クエリに統合)
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { getPersonSchema } from '../schemas';

export interface Person {
  id: string;
  treeId: string;
  displayName: string;
  familyName: string | null;
  givenName: string | null;
  maidenName: string | null;
  gender: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  deathPlace: string | null;
  isAlive: boolean;
  note: string | null;
  primaryPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getPerson(
  input: unknown
): Promise<ActionResult<Person>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = getPersonSchema.safeParse(input);
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

  const { personId } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // 人物の取得と所有権確認を JOIN で一度に行う
  // tree!inner(owner_user_id) の絞り込みにより、所有者以外は PGRST116 (NOT_FOUND) となる
  const { data: person, error: fetchError } = await supabase
    .from('person')
    .select('id, tree_id, display_name, family_name, given_name, maiden_name, gender, birth_year, birth_month, birth_day, birth_place, death_year, death_month, death_day, death_place, is_alive, note, primary_photo_id, created_at, updated_at, tree!inner(owner_user_id)')
    .eq('id', personId)
    .eq('tree.owner_user_id', userId)
    .single();

  if (fetchError || !person) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
    };
  }

  return {
    ok: true,
    data: {
      id: person.id,
      treeId: person.tree_id,
      displayName: person.display_name,
      familyName: person.family_name ?? null,
      givenName: person.given_name ?? null,
      maidenName: person.maiden_name ?? null,
      gender: person.gender ?? null,
      birthYear: person.birth_year ?? null,
      birthMonth: person.birth_month ?? null,
      birthDay: person.birth_day ?? null,
      birthPlace: person.birth_place ?? null,
      deathYear: person.death_year ?? null,
      deathMonth: person.death_month ?? null,
      deathDay: person.death_day ?? null,
      deathPlace: person.death_place ?? null,
      isAlive: person.is_alive,
      note: person.note ?? null,
      primaryPhotoId: person.primary_photo_id ?? null,
      createdAt: person.created_at,
      updatedAt: person.updated_at,
    },
  };
}
