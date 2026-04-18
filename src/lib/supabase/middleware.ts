/**
 * Supabase Middleware ヘルパー
 *
 * middleware.ts (プロジェクトルート) 専用のヘルパー関数。
 * Edge Runtime で動作するため、Node.js API は使用しないこと。
 *
 * 本ファイルは lib/supabase/middleware.ts のみ。
 * middleware.ts 本体 (プロジェクトルートまたは src/) は後続タスク (aeo.2) で実装する。
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * セッション Cookie を更新する。
 *
 * middleware.ts から呼び出し、リクエスト・レスポンスの Cookie をリフレッシュする。
 * 戻り値の NextResponse を middleware から return すること。
 *
 * @param request - Edge Middleware のリクエストオブジェクト
 * @returns Cookie が更新された NextResponse
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッションのリフレッシュ
  // getUser() を呼ぶことで期限切れトークンを自動更新し、Cookie に書き戻す
  await supabase.auth.getUser();

  return response;
}
