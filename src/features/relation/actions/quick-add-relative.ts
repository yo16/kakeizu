'use server';

/**
 * quickAddRelative Server Action
 *
 * 近接ボタンからの一括登録: 人物作成 + 関係作成。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - originPerson から tree_id 取得・所有権確認
 * - プラン上限チェック
 * - person INSERT
 * - kind に応じて relation INSERT (親/子/配偶者の向きを正しく)
 * - 失敗時は作成した person を削除 (手動ロールバック)
 * - revalidatePath
 *
 * api-design.md §3 Relation > quickAddRelative (FR-V5) に準拠。
 */
import { revalidatePath } from 'next/cache';

import { getServerSession } from '@/lib/auth/session';
import { PlanLimitError, assertWithinLimit } from '@/lib/plan/limits';
import { checkAncestorLoop } from '@/lib/relation/cycle-check';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { quickAddRelativeSchema } from '../schemas';

export async function quickAddRelative(
  input: unknown
): Promise<ActionResult<{ personId: string; relationId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = quickAddRelativeSchema.safeParse(input);
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

  const { originPersonId, kind, personDraft, spousePersonId } = parsed.data;
  const userId = session.user.id;

  const supabase = await createClient();

  // originPerson から tree_id を取得し、所有権確認
  const { data: originPerson, error: originError } = await supabase
    .from('person')
    .select('id, tree_id')
    .eq('id', originPersonId)
    .single();

  if (originError || !originPerson) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '起点となる人物が見つかりません' },
    };
  }

  const treeId = originPerson.tree_id;

  // ツリーの所有権確認
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
    console.error('[quickAddRelative] limit check error:', err);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の追加に失敗しました' },
    };
  }

  // person INSERT
  const { data: newPerson, error: personInsertError } = await supabase
    .from('person')
    .insert({
      tree_id: treeId,
      display_name: personDraft.displayName,
      family_name: personDraft.familyName ?? null,
      given_name: personDraft.givenName ?? null,
      maiden_name: personDraft.maidenName ?? null,
      gender: personDraft.gender ?? null,
      birth_year: personDraft.birthYear ?? null,
      birth_month: personDraft.birthMonth ?? null,
      birth_day: personDraft.birthDay ?? null,
      birth_place: personDraft.birthPlace ?? null,
      death_year: personDraft.deathYear ?? null,
      death_month: personDraft.deathMonth ?? null,
      death_day: personDraft.deathDay ?? null,
      death_place: personDraft.deathPlace ?? null,
      is_alive: personDraft.isAlive ?? true,
      note: personDraft.note ?? null,
    })
    .select('id')
    .single();

  if (personInsertError || !newPerson) {
    console.error('[quickAddRelative] person insert error:', personInsertError);
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '人物の作成に失敗しました' },
    };
  }

  const newPersonId = newPerson.id;

  // relation INSERT (手動ロールバック: 失敗時は person を削除)
  // kind に応じた from/to の向きと relation 内容を決定
  let relationInsertData: Record<string, unknown>;

  if (kind === 'parent') {
    // originPerson が子、新規人物が親
    // BFS 循環参照チェック: originPerson の子孫に新規人物が含まれないことを確認
    // (新規人物は作成したばかりで関係がないため、循環は起こり得ないが念のため)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasLoop = await checkAncestorLoop(supabase as any, originPersonId, newPersonId, treeId);
    if (hasLoop) {
      // ロールバック: 作成した person を削除
      await supabase.from('person').delete().eq('id', newPersonId).eq('tree_id', treeId);
      return {
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: '循環した親子関係が生じるため、この関係を作成できません',
        },
      };
    }
    relationInsertData = {
      tree_id: treeId,
      kind: 'parent_child',
      from_person_id: newPersonId,   // 新規人物が親
      to_person_id: originPersonId,  // originPerson が子
      parent_role: 'biological',
    };
  } else if (kind === 'child') {
    // originPerson が親、新規人物が子
    // BFS 循環参照チェック: 新規人物の子孫に originPerson が含まれないことを確認
    // (新規人物は作成したばかりで関係がないため、循環は起こり得ないが念のため)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasLoop = await checkAncestorLoop(supabase as any, newPersonId, originPersonId, treeId);
    if (hasLoop) {
      // ロールバック: 作成した person を削除
      await supabase.from('person').delete().eq('id', newPersonId).eq('tree_id', treeId);
      return {
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: '循環した親子関係が生じるため、この関係を作成できません',
        },
      };
    }
    relationInsertData = {
      tree_id: treeId,
      kind: 'parent_child',
      from_person_id: originPersonId, // originPerson が親
      to_person_id: newPersonId,      // 新規人物が子
      parent_role: 'biological',
    };
  } else {
    // kind === 'spouse'
    // 婚姻種別のデフォルト: 'spouse'、状態のデフォルト: 'current'
    const marriageType = personDraft.marriageType ?? 'spouse';
    const marriageStatus = personDraft.marriageStatus ?? 'current';
    relationInsertData = {
      tree_id: treeId,
      kind: 'marriage',
      from_person_id: originPersonId,
      to_person_id: newPersonId,
      marriage_type: marriageType,
      marriage_status: marriageStatus,
      start_year: personDraft.startYear ?? null,
      start_month: personDraft.startMonth ?? null,
    };
  }

  const { data: newRelation, error: relationInsertError } = await supabase
    .from('relation')
    .insert(relationInsertData)
    .select('id')
    .single();

  if (relationInsertError || !newRelation) {
    console.error('[quickAddRelative] relation insert error:', relationInsertError);
    // ロールバック: 作成した person を削除
    const { error: rollbackError } = await supabase
      .from('person')
      .delete()
      .eq('id', newPersonId)
      .eq('tree_id', treeId);
    if (rollbackError) {
      console.error('[quickAddRelative] rollback delete error:', rollbackError);
    }
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の作成に失敗しました' },
    };
  }

  // kind === 'child' かつ spousePersonId が指定されている場合:
  // spousePersonId (配偶者 = 親B) と新規作成した子との parent_child 関係も作成する。
  // spousePersonId が空文字の場合は「配偶者なし (未婚の子)」として扱い、スキップする。
  if (kind === 'child' && spousePersonId && spousePersonId.length > 0) {
    const spouseRelationData = {
      tree_id: treeId,
      kind: 'parent_child',
      from_person_id: spousePersonId, // 配偶者が親
      to_person_id: newPersonId,      // 新規人物が子
      parent_role: 'biological',
    };
    const { error: spouseRelationError } = await supabase
      .from('relation')
      .insert(spouseRelationData)
      .select('id')
      .single();

    if (spouseRelationError) {
      console.error('[quickAddRelative] spouse parent_child insert error:', spouseRelationError);
      // ロールバック: 作成した person を削除 (最初の relation はカスケードで削除される想定)
      const { error: rollbackError } = await supabase
        .from('person')
        .delete()
        .eq('id', newPersonId)
        .eq('tree_id', treeId);
      if (rollbackError) {
        console.error('[quickAddRelative] rollback delete error (spouse relation):', rollbackError);
      }
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '配偶者との関係の作成に失敗しました' },
      };
    }
  }

  revalidatePath(`/dashboard/trees/${treeId}`);

  return { ok: true, data: { personId: newPersonId, relationId: newRelation.id } };
}
