/**
 * Stripe Webhook 業務エラークラス
 *
 * 業務的失敗（期待される失敗）を表すクラス。
 * route.ts の catch ブロックでこのクラスを判定し、
 * Stripe に 200 を返すことで無限リトライを防ぐ。
 *
 * 想定外エラー（DB接続失敗など）には使用しない。
 * 想定外エラーは通常の Error として上に伝播させ、500 を返す。
 */
export class WebhookBusinessError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

Object.defineProperty(WebhookBusinessError.prototype, 'name', {
  value: 'WebhookBusinessError',
  configurable: true,
  writable: false,
});
