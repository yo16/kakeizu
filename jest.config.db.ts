/**
 * DBマイグレーションテスト用 Jest 設定
 *
 * ローカル Supabase に実接続するため、testEnvironment を node にする。
 * アプリケーションコードのモックは不要（DBの状態そのものをテストする）。
 *
 * 実行コマンド:
 *   npx jest --config jest.config.db.ts
 *
 * 前提条件:
 *   1. ローカル Supabase が起動済みであること（supabase start）
 *   2. マイグレーションと seed が適用済みであること（supabase db reset）
 *   3. 環境変数が設定済みであること（.env.test.local または環境変数）
 */

import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  // Node 環境（ブラウザ環境不要、実 DB 接続）
  testEnvironment: 'node',

  // DBテストのみ対象
  testMatch: ['<rootDir>/tests/db/**/*.test.ts'],

  // テスト実行のタイムアウト（DB操作のため長めに設定）
  testTimeout: 30000,

  // DB 状態の競合を避けるためシングルスレッドで実行
  maxWorkers: 1,

  // カバレッジ対象は不要
  collectCoverage: false,
};

export default createJestConfig(config);
