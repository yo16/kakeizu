# インフラ設計 (Infrastructure Design)

## 概要
Vercel デプロイ構成、環境変数、CI/CD、監視・運用方針を定義する。

## 対象範囲
ホスティング (Vercel) / 環境変数管理 / プレビュー・本番分離 / ドメイン / CI / 環境構築。

## 他ドキュメントとの関係
- アプリ構成: [app-architecture.md](./app-architecture.md)
- Supabase 設定: [supabase-design.md](./supabase-design.md)
- 課金 (Stripe Webhook URL): [billing-design.md](./billing-design.md)
- セキュリティ: [security-design.md](./security-design.md)

---

## 1. ホスティング構成

### Vercel
- フレームワーク: Next.js (App Router) を Auto Detect
- Node Runtime バージョン: 20.x (Vercel デフォルト推奨)
- リージョン: `hnd1` (東京) を主リージョンに固定
- Functions:
  - 通常 Server Actions / Server Components: Edge は使わず Node 推奨
  - `middleware.ts`: Edge Runtime
  - `/api/stripe/webhook`: Node Runtime (raw body 必須)
  - `/api/export/{pdf,png}`: Node Runtime (puppeteer 想定 → Edge 不可)

### Git ブランチ → 環境マッピング (Git 戦略)

| ブランチ | Vercel 環境 | URL | 用途 |
|---|---|---|---|
| `release` | Production | `https://kakeizu.example.com` | 本番 |
| `preview` | Preview (named) | `https://preview.kakeizu.example.com` | 内部プレビュー |
| `dev` | Preview (named) | `https://dev.kakeizu.example.com` | 開発統合 |
| `feature/bd-*` | Preview (auto) | `https://feature-bd-xxx-...vercel.app` | PR プレビュー |

- Vercel の「Production Branch」を `release` に設定
- `preview` / `dev` は固定エイリアスドメインを Vercel で割当

---

## 2. 環境変数

### 区分
- **Production**: 本番用キー
- **Preview**: dev / preview / feature ブランチ用 (テスト用 Stripe + 開発用 Supabase Project)
- **Development (ローカル)**: `.env.local`

### 変数一覧

| 名前 | スコープ | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Server + Client | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Server + Client | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | RLS バイパス用。client にバンドル禁止 |
| `SUPABASE_JWT_SECRET` | Server only | Edge での JWT 検証 (jose) |
| `STRIPE_SECRET_KEY` | Server only | Stripe シークレット |
| `STRIPE_WEBHOOK_SECRET` | Server only | Webhook 署名検証 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Server + Client | Stripe.js 用 |
| `STRIPE_PRICE_BASIC_JPY_MONTHLY` | Server only | Basic プラン Price ID |
| `STRIPE_PRICE_STANDARD_JPY_MONTHLY` | Server only | Standard プラン Price ID |
| `NEXT_PUBLIC_SITE_URL` | Server + Client | OAuth リダイレクト等 |
| `RESEND_API_KEY` (将来) | Server only | 通知メール (MVP では Supabase Auth 標準のみ) |
| `LOG_LEVEL` | Server only | `info` / `debug` 等 |

### 命名規約
- クライアントへ露出する変数だけ `NEXT_PUBLIC_` プレフィックス
- それ以外は Server only と明示し、`lib/env.ts` で zod 検証

### 環境変数の検証
- `lib/env.ts` で起動時に `process.env` を zod パース
- 必須変数が欠損していればビルド失敗 (Vercel の build 時にエラー)

---

## 3. ドメイン・SSL
- 主ドメイン: `kakeizu.example.com` (本番)
- Vercel が自動で TLS 証明書を発行 (Let's Encrypt)
- カスタムドメイン設定後は Stripe Webhook URL もこのドメインに登録

---

## 4. CI/CD

### Vercel ビルドパイプライン (各 push)
1. Install (`npm ci`)
2. Lint (`npm run lint`)
3. Type check (`npm run typecheck`)
4. Unit test (`npm run test`)
5. Build (`next build`)
6. Deploy

### GitHub Actions (補助 CI)
- PR への push 時:
  - Lint + Typecheck + Unit テスト
  - Playwright E2E は Preview デプロイ完了後にトリガ (将来)
- `main` (Beads ワークフローでは `dev`) への merge 時: 同上 + Supabase マイグレーション dry-run

### GitHub Actions: Supabase キープアライブ (NFR-A3)

Supabase Free プランは一定期間 (現在 7 日想定) アクセスがないとプロジェクトが自動停止される。これを回避するため、GitHub Actions のスケジュール起動で `keepalive_ping` テーブルへ定期書き込みを行う。

#### Workflow 仕様
- ファイル: `.github/workflows/supabase-keepalive.yml`
- トリガ: `schedule` (cron) — 2 日に 1 回 (例: `0 3 */2 * *` 朝 3 時 UTC = 正午 JST)
- `workflow_dispatch` も併設し、手動実行を可能にする
- 対象環境:
  - **Production** Supabase Project (`release` ブランチ運用環境)
  - **Preview** Supabase Project も同様に対象 (停止すると preview が機能しないため)

#### 処理内容
1. `keepalive_ping` に 1 行 INSERT (`source='github-actions'`)
2. ジョブの成否を Action ログで確認

レコードは削除せず蓄積する (1 年で約 183 行のため肥大化しない)。書き込み履歴自体が「Workflow が生きていた時間の記録」として運用ログの代わりとなる。

#### 実装方式
- 公式の `supabase` CLI を使うか、`@supabase/supabase-js` を使った最小スクリプト (`scripts/keepalive.ts`) を実行
- 認証は Service Role Key を使用 (RLS をバイパス)
- 環境変数: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (GitHub Secrets で管理)

#### 運用切替
- Supabase を **Pro プランに移行した時点でこの Workflow は不要**になる
- `cron` トリガをコメントアウトし、`workflow_dispatch` のみ残す or `release` ブランチから削除する運用とする
- 将来 Vercel Cron に置き換える選択肢もあるが、Vercel の Cron は Pro プラン以上の機能のため、コスト面で GitHub Actions を採用する

#### 失敗時の挙動
- 失敗 1 回ではアラートしない (GitHub Actions の通知メールでオーナーが気づく前提)
- 連続 2 回失敗時に手動確認を運用ルール化 (オープン事項 O-IF8)

### Supabase マイグレーション
- `supabase/migrations/` を Git 管理
- 適用は手動または `supabase db push` を CI で (オープン事項)
- ロールバックは Supabase Console から PITR

---

## 5. プレビュー環境のデータ分離
- Preview 用 Supabase Project を別途作成 (本番と分離)
- Preview 用 Stripe アカウント (test mode) を使用
- Preview の `NEXT_PUBLIC_SITE_URL` はブランチごとに動的、Stripe Webhook は Preview 専用 endpoint を 1 つ用意 (Stripe CLI 連携 or プレビュー専用 URL)

---

## 6. ローカル開発環境
- Node 20.x
- pnpm or npm (オープン事項)
- Supabase ローカル環境 (`supabase start`) で DB / Auth / Storage を再現
- Stripe CLI で `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- `.env.local.example` を Git 管理。実値は `.env.local` (gitignore)

---

## 7. 監視・ログ
- Vercel Dashboard (Functions ログ・帯域)
- Supabase Dashboard (DB / Auth / Storage の使用量)
- Stripe Dashboard (課金状態)
- アプリログ: `console.info` ベース (Vercel が収集)
- 外部監視 (Sentry / Datadog) は MVP では未導入 (オープン事項)

### 主要メトリクスの観察対象
- Supabase Storage 使用量 (egress 含む) — R-4 関連
- Function 実行時間 (NFR-P2)
- 5xx 発生率
- Stripe Webhook 失敗率

---

## 8. バックアップ・DR
- DB: Supabase 標準バックアップ (Pro プランで PITR)
- Storage: 重要データのため定期スナップショット運用 (オープン事項)
- 構成として「Supabase Project の Region」と「Vercel Region」を一致させる (東京)

---

## 9. デプロイ運用ルール
- `release` ブランチへの merge は手動レビュー後のみ
- 本番デプロイ時はメンテナンス窓を設けない (アプリ規模上不要)
- Stripe Price ID 変更などプラン構成変更は事前に環境変数更新 + マイグレーション seed 更新

---

## 10. オープン事項
- O-IF1: Supabase マイグレーションを CI で自動 push するかどうか (現在は手動)
- O-IF2: Sentry など監視ツールの導入時期
- O-IF3: pnpm vs npm の最終決定
- O-IF4: Storage egress が増えた場合の Cloudflare R2 等への移行閾値 (要件 O-9)
- O-IF5: Preview 環境用の Stripe Webhook 配信方式 (Stripe ダッシュボードに静的 URL を登録する案 / プレビューごとに CLI フォワード)
- O-IF6: PDF/PNG エクスポート用 puppeteer のメモリ・実行時間が Vercel Function の上限内に収まるか (要検証)
- O-IF7: Edge ミドルウェアでの Cookie 検証コストとリージョンレイテンシ (東京固定で十分か)
- O-IF8: Keepalive Workflow が連続失敗した場合の通知方式 (Slack Webhook / Discord Webhook / メール)。MVP は GitHub からの自動通知メールに依存
