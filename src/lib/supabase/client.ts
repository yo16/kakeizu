/**
 * Supabase Browser クライアント
 *
 * Client Components から使用するブラウザ用クライアント。
 * サーバーサイドでは使用しないこと（server.ts を使用すること）。
 */
import { createBrowserClient } from '@supabase/ssr';

/**
 * ブラウザ用 Supabase クライアントを生成する。
 * Client Components ('use client') から使用する。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
