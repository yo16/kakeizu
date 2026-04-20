'use server';

/**
 * updatePerson Server Action
 *
 * 人物情報を更新する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - 人物の取得とツリー所有権確認 (TOCTOU対策: UPDATE クエリにも owner フィルタ付与)
 * - UPDATE
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { updatePersonSchema } from '../schemas';

export async function updatePerson(input: unknown): Promise<ActionResult<void>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = updatePersonSchema.safeParse(input);
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

  const {
    personId,
    displayName,
    familyName,
    givenName,
    maidenName,
    gender,
    birth,
    birthPlace,
    death,
    deathPlace,
    isAlive,
    note,
  } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // 人物の取得とツリー所有権確認
  const { data: person, error: fetchError } = await supabase
    .from('person')
    .select('id, tree_id')
    .eq('id', personId)
    .single();

  if (fetchError || !person) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
    };
  }

  // ツリーの所有権確認
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .select('id')
    .eq('id', person.tree_id)
    .eq('owner_user_id', userId)
    .single();

  if (treeError || !tree) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'この人物へのアクセス権がありません' },
    };
  }

  // 更新データ構築 (指定されたフィールドのみ)
  const updateData: Record<string, unknown> = {};

  if (displayName !== undefined) {
    updateData.display_name = displayName;
  }
  if (familyName !== undefined) {
    updateData.family_name = familyName;
  }
  if (givenName !== undefined) {
    updateData.given_name = givenName;
  }
  if (maidenName !== undefined) {
    updateData.maiden_name = maidenName;
  }
  if (gender !== undefined) {
    updateData.gender = gender;
  }
  if (birth !== undefined) {
    if (birth.year !== undefined) updateData.birth_year = birth.year;
    if (birth.month !== undefined) updateData.birth_month = birth.month;
    if (birth.day !== undefined) updateData.birth_day = birth.day;
  }
  if (birthPlace !== undefined) {
    updateData.birth_place = birthPlace;
  }
  if (death !== undefined) {
    if (death.year !== undefined) updateData.death_year = death.year;
    if (death.month !== undefined) updateData.death_month = death.month;
    if (death.day !== undefined) updateData.death_day = death.day;
  }
  if (deathPlace !== undefined) {
    updateData.death_place = deathPlace;
  }
  if (isAlive !== undefined) {
    updateData.is_alive = isAlive;
  }
  if (note !== undefined) {
    updateData.note = note;
  }

  // TOCTOU対策: person の tree_id が自分のツリーであることを in() で絞る
  const { error: updateError } = await supabase
    .from('person')
    .update(updateData)
    .eq('id', personId)
    .in(
      'tree_id',
      (
        await supabase
          .from('tree')
          .select('id')
          .eq('owner_user_id', userId)
      ).data?.map((t) => t.id) ?? []
    );

  if (updateError) {
    console.error('[updatePerson] update error:', updateError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の更新に失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${person.tree_id}`);

  return { ok: true, data: undefined };
}
