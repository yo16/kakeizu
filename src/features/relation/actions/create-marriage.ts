'use server';

/**
 * createMarriage Server Action
 *
 * 既存の2人物間に婚姻関係を作成する。
 * - 入力バリデーション (zod)
 * - ツリー所有権確認
 * - 重複チェック (DB UNIQUE 制約 + アプリ層プリチェック)
 * - INSERT
 */
import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';
import { createMarriageSchema, type CreateMarriageInput } from '../schemas';

export async function createMarriage(
  input: unknown
): Promise<ActionResult<{ relationId: string }>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = createMarriageSchema.safeParse(input);
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
    partnerAId,
    partnerBId,
    type: marriageType,
    status: marriageStatus,
    startYear,
    startMonth,
    endYear,
    endMonth,
    note,
  } = parsed.data as CreateMarriageInput;

  if (partnerAId === partnerBId) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '同じ人物を指定できません', field: 'partnerBId' },
    };
  }

  const supabase = await createClient();

  // パートナーAのツリーIDを取得し、ユーザーの所有権確認
  const { data: personA, error: personAError } = await supabase
    .from('person')
    .select('tree_id')
    .eq('id', partnerAId)
    .single();

  if (personAError || !personA) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
    };
  }

  const treeId = personA.tree_id;

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

  // パートナーBが同じツリーに属しているか確認
  const { data: personB, error: personBError } = await supabase
    .from('person')
    .select('tree_id')
    .eq('id', partnerBId)
    .eq('tree_id', treeId)
    .single();

  if (personBError || !personB) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: '相手の人物が見つかりません (同一ツリー内でのみ関係を作成できます)' },
    };
  }

  // 重複チェック: 同じペア・同じ婚姻種別が既に存在するか
  // DB の UNIQUE インデックスは LEAST/GREATEST を使うので、A-B / B-A どちらも確認
  const { data: existingAB } = await supabase
    .from('relation')
    .select('id')
    .eq('kind', 'marriage')
    .eq('marriage_type', marriageType)
    .eq('from_person_id', partnerAId)
    .eq('to_person_id', partnerBId)
    .maybeSingle();

  const { data: existingBA } = await supabase
    .from('relation')
    .select('id')
    .eq('kind', 'marriage')
    .eq('marriage_type', marriageType)
    .eq('from_person_id', partnerBId)
    .eq('to_person_id', partnerAId)
    .maybeSingle();

  if (existingAB || existingBA) {
    return {
      ok: false,
      error: {
        code: 'RELATION_CONFLICT',
        message: 'この2人の間には既に同じ婚姻種別の関係が存在します',
      },
    };
  }

  // INSERT
  const { data: inserted, error: insertError } = await supabase
    .from('relation')
    .insert({
      tree_id: treeId,
      kind: 'marriage',
      from_person_id: partnerAId,
      to_person_id: partnerBId,
      marriage_type: marriageType,
      marriage_status: marriageStatus,
      start_year: startYear ?? null,
      start_month: startMonth ?? null,
      end_year: endYear ?? null,
      end_month: endMonth ?? null,
      note: note ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[createMarriage] insert error:', insertError);
    // DB UNIQUE 制約違反の場合
    if (insertError?.code === '23505') {
      return {
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: 'この2人の間には既に同じ婚姻種別の関係が存在します',
        },
      };
    }
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '関係の作成に失敗しました' },
    };
  }

  return { ok: true, data: { relationId: inserted.id } };
}
