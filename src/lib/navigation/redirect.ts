/**
 * クライアントサイドの外部リダイレクト用ヘルパー。
 *
 * Stripe Checkout / Customer Portal など外部 URL への遷移時に使用する。
 * window.location.assign を関数で抽象化することでテストでのモックを容易にする
 * (jsdom では window.location プロパティの直接置換が制約により困難なため)。
 */
export function redirectExternal(url: string): void {
  window.location.assign(url);
}
