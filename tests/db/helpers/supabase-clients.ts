/**
 * DBマイグレーションテスト用 Supabase クライアントヘルパー
 *
 * ローカル Supabase (supabase start) に接続するためのクライアントを提供する。
 * - adminClient: Service Role キー使用（RLS バイパス）
 * - anonClient:  anon キー使用（未認証ユーザー相当）
 * - createUserClient: 特定ユーザーとして認証済みクライアントを返す
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ローカル Supabase のデフォルト URL とキー（supabase start で表示される値）
const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0';
const ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oHa-k2Tlmjp5FDrFY7jNeX5s14iFEgEk';

/**
 * Service Role クライアント（RLS バイパス）
 * DB の直接操作、テストデータのセットアップ・クリーンアップに使用する
 */
export const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * anon クライアント（未認証ユーザー相当）
 * RLS ポリシーの anon 許可テストに使用する
 */
export const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
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
  const client = createClient(SUPABASE_URL, ANON_KEY, {
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
 * Service Role Admin API を使用して直接 auth.users に挿入する
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
