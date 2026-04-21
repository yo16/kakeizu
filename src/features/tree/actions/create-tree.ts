'use server';

/**
 * createTree Server Action
 *
 * 新規ツリーを作成する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - プラン上限チェック
 * - INSERT
 * - revalidatePath('/dashboard')
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { PlanLimitError, assertWithinLimit } from '@/lib/plan/limits';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { treeCreateSchema } from '../schemas';

export async function createTree(
  input: unknown
): Promise<ActionResult<{ treeId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = treeCreateSchema.safeParse(input);
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

  const { title, description } = parsed.data;
  const userId = session.user.id;

  // プラン上限チェック
  try {
    await assertWithinLimit({ kind: 'tree', userId });
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
    console.error('[createTree] limit check error:', err);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリーの作成に失敗しました' },
    };
  }

  const supabase = await createClient();

  const { data: inserted, error: insertError } = await supabase
    .from('tree')
    .insert({
      owner_user_id: userId,
      title,
      description: description ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[createTree] insert error:', insertError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'ツリーの作成に失敗しました' },
    };
  }

  revalidatePath('/dashboard');

  return { ok: true, data: { treeId: inserted.id } };
}
