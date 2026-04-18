/**
 * Supabase Server クライアント
 *
 * Server Components / Server Actions / Route Handlers から使用するクライアント。
 * このファイルはサーバーサイド専用。クライアントバンドルへの混入を `server-only` で防止。
 *
 * - createClient(): Cookie ベースのクライアント (通常のユーザー操作)
 * - createServiceRoleClient(): RLS バイパス用 Service Role クライアント
 *   - 使用用途を以下に限定すること:
 *     - 共有 URL (/share/[token]) のデータ取得
 *     - Stripe Webhook 処理時の Subscription 更新
 *     - PDF/PNG エクスポート時のサーバー側データ取得
 */
import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Cookie ベースの Supabase クライアントを生成する。
 * Server Components / Server Actions / Route Handlers から使用する。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component から呼ばれた場合は set 不可。
            // middleware.ts で Cookie が更新される前提のため、ここでは無視する。
          }
        },
      },
    }
  );
}

/**
 * RLS をバイパスする Service Role クライアントを生成する。
 *
 * 注意: このファイル内でのみ Service Role クライアントを生成すること。
 * 通常のユーザー操作では絶対に使用しないこと。
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
