'use server';

/**
 * createShareLink Server Action
 *
 * 家系図の共有URLトークンを生成し share_link テーブルに INSERT する。
 * - 認証チェック
 * - 入力バリデーション (zod)
 * - トークン生成 (ULID + base64url ランダム32バイト)
 * - INSERT (UNIQUE違反時は最大3回リトライ)
 * - tree_id UNIQUE違反時は ALREADY_EXISTS エラー返却
 *
 * NOTE: tree_id は UNIQUE制約があるため 1ツリー1リンクのみ作成可能。
 * 既存リンクがある場合は ALREADY_EXISTS エラーを返す。
 * 再生成 (既存無効化 + 新規作成) は別タスクのスコープ。
 */
import { randomBytes } from 'crypto';

import { ulid } from 'ulid';

import { getServerSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { type ActionResult } from '@/types/action';

import { createShareLinkSchema } from '../schemas';

/** Postgres UNIQUE違反エラーコード */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * URL安全なトークン文字列を生成する。
 * ULID (26文字) + "_" + 32バイト乱数の base64url エンコード文字列。
 */
function generateShareToken(): string {
  const id = ulid();
  const random = randomBytes(32).toString('base64url');
  return `${id}_${random}`;
}

export interface ShareLink {
  id: string;
  treeId: string;
  token: string;
  isEnabled: boolean;
  createdAt: string;
}

export async function createShareLink(
  input: unknown
): Promise<ActionResult<ShareLink>> {
  // 認証チェック
  const session = await getServerSession();
  if (!session) {
    return {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
    };
  }

  // バリデーション
  const parsed = createShareLinkSchema.safeParse(input);
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

  // トークン生成 + INSERT (UNIQUE違反時は最大3回リトライ)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const token = generateShareToken();

    const { data: inserted, error: insertError } = await supabase
      .from('share_link')
      .insert({
        tree_id: treeId,
        token,
      })
      .select('id, tree_id, token, is_enabled, created_at')
      .single();

    if (insertError) {
      // tree_id UNIQUE違反: 既にこのツリーのリンクが存在する
      if (
        insertError.code === PG_UNIQUE_VIOLATION &&
        insertError.message.includes('tree_id')
      ) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_EXISTS',
            message: 'このツリーの共有リンクは既に存在します',
          },
        };
      }

      // token UNIQUE違反: 次のリトライへ
      if (
        insertError.code === PG_UNIQUE_VIOLATION &&
        attempt < MAX_RETRIES
      ) {
        console.warn(
          `[createShareLink] token collision on attempt ${attempt}, retrying...`
        );
        continue;
      }

      console.error('[createShareLink] insert error:', insertError);
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '共有リンクの作成に失敗しました',
        },
      };
    }

    if (!inserted) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '共有リンクの作成に失敗しました',
        },
      };
    }

    return {
      ok: true,
      data: {
        id: inserted.id,
        treeId: inserted.tree_id,
        token: inserted.token,
        isEnabled: inserted.is_enabled,
        createdAt: inserted.created_at,
      },
    };
  }

  // 3回リトライ後もトークン衝突が続いた場合
  console.error('[createShareLink] token generation failed after max retries');
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '共有リンクの作成に失敗しました',
    },
  };
}
