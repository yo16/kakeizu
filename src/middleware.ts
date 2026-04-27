/**
 * Next.js Edge Middleware
 *
 * 役割:
 * 1. @supabase/ssr パターンでセッション Cookie を自動更新（updateSession 経由）
 * 2. 保護ルートへの未認証アクセスを /login にリダイレクト
 * 3. リフレッシュトークン失効時は /login?reason=session_expired にリダイレクト
 *
 * Edge Runtime で動作するため、Node.js 専用 API は使用しないこと。
 * JWT 検証は @supabase/ssr（Web Crypto API ベース）を使用する。
 */
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/** 認証必須パスのプレフィックス一覧 */
const PROTECTED_PATHS = ['/dashboard', '/trees', '/account', '/onboarding'];

/**
 * パスが保護対象かどうかを判定する。
 */
function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // セッション Cookie を更新しつつ、認証ユーザーを取得する
  // updateSession() だけでは user 情報が取れないため、ここで直接 createServerClient を使う
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  // NOTE: getUser() を呼ぶことでリフレッシュトークンによるセッション更新が行われ、
  // 更新されたトークンが Cookie に書き戻される。
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // 保護ルート以外はセッション更新だけ行って通過
  if (!isProtectedPath(pathname)) {
    return response;
  }

  // 保護ルートへのアクセス: 認証チェック
  if (authError) {
    // リフレッシュトークン失効など認証エラー → session_expired を付けてリダイレクト
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'session_expired');
    return NextResponse.redirect(loginUrl);
  }

  if (!user) {
    // 未認証 → ログインページへリダイレクト
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 認証済み → セッション更新済みのレスポンスをそのまま返す
  return response;
}

export const config = {
  matcher: [
    /*
     * 以下のパスを除いたすべてのリクエストにマッチする:
     * - api/stripe/webhook: Stripe Webhook（署名検証のみで認証不要）
     * - auth/callback: OAuth コールバック（認証処理中）
     * - _next/static: Next.js 静的アセット
     * - _next/image: Next.js 画像最適化
     * - favicon.ico: ファビコン
     * - share: 公開閲覧ルート（未認証でもアクセス可）
     */
    '/((?!api/stripe/webhook|auth/callback|_next/static|_next/image|favicon\\.ico|share).*)',
  ],
};
