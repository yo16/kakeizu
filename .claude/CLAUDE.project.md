# プロジェクト固有設定

## プロジェクト概要

家系図作成サービス。個人・家族で利用するフリーミアムモデルのWebサービス。
詳細は `doc/requirements.md` を参照。

## 技術スタック

- フレームワーク: Next.js (App Router)
- スタイリング: CSS Modules + CSS Custom Properties（Tailwind CSS は禁止）
- DB / Auth / Storage: Supabase
- 課金: Stripe（Checkout / Customer Portal / Webhook）
- タスク管理: Beads
- テスト: Jest + React Testing Library（単体・結合） / Playwright（E2E）
- デプロイ: Vercel
- 言語: TypeScript

## Git戦略

### ブランチ構成
- `release`: 正式版ブランチ（エージェント操作禁止）
- `preview`: プレビュー版ブランチ（エージェント操作禁止）
- `dev`: 開発ブランチ（featureブランチのマージ先）
- `feature/bd-{beads-id}`: タスクごとのブランチ

### ルール
- Git Worktreeを使い、並行で進められるタスクは並行で進める
- featureブランチはBeadsのIDを使って命名する
- release, previewブランチはエージェントが操作しない
- コミットメッセージは日本語で記述する

## 要件定義ドキュメント

- 配置先: `doc/requirements.md`

## 設計ドキュメント構成

設計エージェント(`design-architect`)が作成する設計ドキュメントの一覧:

- `doc/design/overview.md`: 設計概要（各ドキュメントへのリンク集）
- `doc/design/app-architecture.md`: アプリ構成、ページ構成、状態管理、ルーティング
- `doc/design/api-design.md`: API設計（Next.js API Routes / Server Actions）
- `doc/design/db-design.md`: スキーマ設計、ER図、インデックス戦略
- `doc/design/supabase-design.md`: RLSポリシー、Auth設定、Storage設計
- `doc/design/frontend-design.md`: コンポーネント設計、ページ遷移、UIインタラクション
- `doc/design/styling-design.md`: デザインシステム、カラー、タイポグラフィ
- `doc/design/billing-design.md`: Stripe連携、プラン管理、Webhook処理、上限チェック
- `doc/design/tree-visualization-design.md`: 家系図ツリーのレイアウト・描画アルゴリズム、タイムライン連動
- `doc/design/infra-design.md`: Vercelデプロイ設定、環境変数、CI/CD
- `doc/design/security-design.md`: 認証フロー、RLS、Webhook署名検証、脆弱性対策方針

## プロジェクト固有ルール

- スタイリングは CSS Modules + CSS Custom Properties で実装する。Tailwind CSS の使用は厳禁
- コミットメッセージは日本語で記述する
- 写真などのバイナリは Supabase Storage に保存し、リポジトリに含めない
- Stripe のシークレットキー・Webhook シークレットは環境変数で管理し、コードに直書きしない
- 個人情報（氏名・写真等）を含むテストデータは `tmp/` 配下にのみ配置し、コミットしない
