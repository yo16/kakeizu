/**
 * errors.ts ユニットテスト
 *
 * テスト対象: WebhookBusinessError クラス
 */

import { WebhookBusinessError } from '../errors';

describe('WebhookBusinessError', () => {
  it('message が引数で指定した文字列であること', () => {
    const err = new WebhookBusinessError('test message');
    expect(err.message).toBe('test message');
  });

  it('name が "WebhookBusinessError" であること', () => {
    const err = new WebhookBusinessError('test message');
    expect(err.name).toBe('WebhookBusinessError');
  });

  it('instanceof WebhookBusinessError が true であること', () => {
    const err = new WebhookBusinessError('test message');
    expect(err instanceof WebhookBusinessError).toBe(true);
  });

  it('instanceof Error が true であること (Error を継承していること)', () => {
    const err = new WebhookBusinessError('test message');
    expect(err instanceof Error).toBe(true);
  });

  it('prototype chain が壊れていないこと (constructor が WebhookBusinessError を指すこと)', () => {
    const err = new WebhookBusinessError('test message');
    expect(err.constructor).toBe(WebhookBusinessError);
  });

  it('Object.setPrototypeOf による修正後も instanceof が正しく動作すること', () => {
    // TypeScript でクラスを extends Error した場合に prototype chain が
    // 壊れるケースの回避策として Object.setPrototypeOf を使用しているため
    // catch ブロックで instanceof チェックが正しく機能することを確認する
    let caught: unknown;
    try {
      throw new WebhookBusinessError('thrown error');
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof WebhookBusinessError).toBe(true);
    expect(caught instanceof Error).toBe(true);
  });

  it('異なるメッセージで複数インスタンスを生成しても各インスタンスが独立していること', () => {
    const err1 = new WebhookBusinessError('message one');
    const err2 = new WebhookBusinessError('message two');
    expect(err1.message).toBe('message one');
    expect(err2.message).toBe('message two');
    expect(err1).not.toBe(err2);
  });
});
