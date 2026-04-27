/**
 * getOrigin ヘルパー
 *
 * リクエストの origin を取得する。
 * Next.js の headers() から host / x-forwarded-proto を組み立て、
 * fallback として NEXT_PUBLIC_SITE_URL を使用する。
 *
 * billing Server Actions (create-checkout-session / create-portal-session) で共通使用。
 */
import 'server-only';

import { headers } from 'next/headers';

export async function getOrigin(): Promise<string> {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const proto =
      headersList.get('x-forwarded-proto') ??
      (process.env.NODE_ENV === 'production' ? 'https' : 'http');

    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    // headers() が利用できない環境 (e.g. テスト) では fallback を使う
  }

  return fallback;
}
