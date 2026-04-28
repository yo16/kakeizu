/**
 * アプリケーション共通 logger
 *
 * console を直接使用せず、この logger を経由する。
 * 環境 (development / production) によって挙動を変える:
 * - log/info/debug: development のみ出力 (production では no-op)
 * - warn/error: 常に出力 (本番でも記録される)
 *
 * 将来的に Sentry などのサービスへの送信を組み込む場合は、
 * warn/error 内で外部送信処理を追加する。
 */

type LogArgs = Parameters<typeof console.log>;

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export const logger = {
  log: (...args: LogArgs): void => {
    if (isDev()) {
      console.log(...args);
    }
  },
  info: (...args: LogArgs): void => {
    if (isDev()) {
      console.info(...args);
    }
  },
  debug: (...args: LogArgs): void => {
    if (isDev()) {
      console.debug(...args);
    }
  },
  warn: (...args: LogArgs): void => {
    console.warn(...args);
  },
  error: (...args: LogArgs): void => {
    console.error(...args);
  },
};
