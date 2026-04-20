/**
 * Jest 実行環境 (jsdom) に Web API グローバル (Request / Response / Headers / fetch) を注入する。
 *
 * setupFiles に指定することで、テストフレームワークより前に実行され、
 * next/server の import 評価時点でグローバルが確立される。
 *
 * Node.js 18+ はネイティブで Web Fetch API を提供するため、
 * undici への依存なしに利用できる。
 * jsdom 環境ではこれらのグローバルが未定義になるため、
 * Node.js ネイティブの実装を注入する。
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Node.js 18+ 組み込みの undici ベース Web Fetch API を取得
// require('undici') が利用できる場合はそちらを優先、
// なければ Node.js グローバルにネイティブ実装が存在する (v18+)
let webApiGlobals: Record<string, unknown>;

try {
  webApiGlobals = require('undici');
} catch {
  // undici が直接インストールされていない場合は Node.js ネイティブを使用
  // Node.js 18+ では globalThis に Request/Response/Headers/fetch が存在する
  webApiGlobals = {};
}

const apiNames = ['Request', 'Response', 'Headers', 'fetch', 'FormData', 'ReadableStream', 'WritableStream', 'TransformStream'] as const;

for (const name of apiNames) {
  if (typeof (globalThis as any)[name] === 'undefined') {
    const native = (webApiGlobals as any)[name] ?? (global as any)[name];
    if (native !== undefined) {
      Object.defineProperty(globalThis, name, {
        value: native,
        writable: true,
        configurable: true,
      });
    }
  }
}
