/**
 * Supabase Keepalive Script
 *
 * GitHub Actions の cron スケジュールから実行される。
 * Supabase Free プランの非アクティブ自動停止を回避するため、
 * keepalive_ping テーブルへ INSERT してプロジェクトをアクティブに保つ。
 *
 * 必要な環境変数:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

export async function runKeepalive(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from('keepalive_ping')
    .insert({ source: 'github-actions' });

  if (error) {
    throw new Error(`INSERT エラー: ${error.message}`);
  }
}

// エントリーポイント (tsx から直接実行された場合 / テスト環境では実行しない)
if (process.env.NODE_ENV !== 'test') {
  runKeepalive().then(
    () => {
      console.log('[keepalive] 成功');
    },
    (err) => {
      console.error('[keepalive] エラー:', err);
      process.exit(1);
    },
  );
}
