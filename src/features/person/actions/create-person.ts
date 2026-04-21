'use server';

/**
 * createPerson Server Action
 *
 * ツリーに新しい人物を追加する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - プラン上限チェック
 * - INSERT
 * - revalidatePath
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { PlanLimitError, assertWithinLimit } from '@/lib/plan/limits';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { createPersonSchema } from '../schemas';

export async function createPerson(
  input: unknown
): Promise<ActionResult<{ personId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = createPersonSchema.safeParse(input);
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
    treeId,
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

  // プラン上限チェック
  try {
    await assertWithinLimit({ kind: 'person', userId, treeId });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return {
        ok: false,
        error: {
          code: 'PLAN_LIMIT_EXCEEDED',
          message: err.message,
        },
      };
    }
    console.error('[createPerson] limit check error:', err);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の追加に失敗しました' },
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('person')
    .insert({
      tree_id: treeId,
      display_name: displayName,
      family_name: familyName ?? null,
      given_name: givenName ?? null,
      maiden_name: maidenName ?? null,
      gender: gender ?? null,
      birth_year: birth?.year ?? null,
      birth_month: birth?.month ?? null,
      birth_day: birth?.day ?? null,
      birth_place: birthPlace ?? null,
      death_year: death?.year ?? null,
      death_month: death?.month ?? null,
      death_day: death?.day ?? null,
      death_place: deathPlace ?? null,
      is_alive: isAlive ?? true,
      note: note ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[createPerson] insert error:', insertError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の追加に失敗しました' },
    };
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: { personId: inserted.id } };
}
