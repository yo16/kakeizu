-- Migration: keepalive_ping テーブル作成
-- Topic: Supabase Free プランの自動停止 (pause) 回避用ログ
-- GitHub Actions のスケジュール起動から Service Role で書き込まれる運用専用テーブル

CREATE TABLE public.keepalive_ping (
  id        bigserial   PRIMARY KEY,
  pinged_at timestamptz NOT NULL DEFAULT now(),
  source    text        NOT NULL DEFAULT 'github-actions'
);

-- RLS 有効化
-- ポリシーは定義しない = 一般ユーザーは全操作拒否
-- Service Role (GitHub Actions) からのアクセスは RLS をバイパスするため INSERT 可能
ALTER TABLE public.keepalive_ping ENABLE ROW LEVEL SECURITY;
