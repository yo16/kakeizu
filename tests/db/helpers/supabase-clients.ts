/**
 * DBマイグレーションテスト用 Supabase クライアントヘルパー
 *
 * ローカル Supabase (supabase start) に接続するためのクライアントを提供する。
 * - adminClient: Secret Key 使用（RLS バイパス）
 * - anonClient:  Publishable Key 使用（未認証ユーザー相当）
 * - createUserClient: 特定ユーザーとして認証済みクライアントを返す
 *
 * 実行前に `.env.test.local` に以下を設定すること:
 *   TEST_SUPABASE_URL              (デフォルト: http://127.0.0.1:54321)
 *   TEST_SUPABASE_PUBLISHABLE_KEY  (`supabase status` の Publishable key)
 *   TEST_SUPABASE_SECRET_KEY       (`supabase status` の Secret key)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.TEST_SUPABASE_SECRET_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error(
    'TEST_SUPABASE_PUBLISHABLE_KEY が設定されていません。`supabase status` の出力を `.env.test.local` に設定してください。'
  );
}
if (!SECRET_KEY) {
  throw new Error(
    'TEST_SUPABASE_SECRET_KEY が設定されていません。`supabase status` の出力を `.env.test.local` に設定してください。'
  );
}

/**
 * Secret Key クライアント（RLS バイパス）
 * DB の直接操作、テストデータのセットアップ・クリーンアップに使用する
 */
export const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Publishable Key クライアント（未認証ユーザー相当）
 * RLS ポリシーの anon 許可テストに使用する
 */
export const anonClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * 指定したユーザーとして認証済みの Supabase クライアントを返す
 * RLS ポリシーの authenticated ユーザーテストに使用する
 *
 * @param email    テストユーザーのメールアドレス
 * @param password テストユーザーのパスワード
 */
export async function createUserClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`ユーザーサインイン失敗: ${error.message} (email: ${email})`);
  }
  return client;
}

/**
 * テスト用ユーザーを作成し、ユーザーID を返す
 * Secret Key Admin API を使用して直接 auth.users に挿入する
 *
 * @param email    作成するユーザーのメールアドレス
 * @param password 作成するユーザーのパスワード
 * @param fullName raw_user_meta_data->>'full_name' に設定する値（省略可）
 */
export async function createTestUser(
  email: string,
  password: string,
  fullName?: string
): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (error || !data.user) {
    throw new Error(`テストユーザー作成失敗: ${error?.message} (email: ${email})`);
  }
  return data.user.id;
}

/**
 * テスト用ユーザーを削除する（CASCADE で profile / subscription も削除される）
 *
 * @param userId 削除するユーザーID
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`テストユーザー削除失敗: ${error.message} (userId: ${userId})`);
  }
}
