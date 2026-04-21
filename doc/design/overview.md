# 設計概要 (Overview)

家系図作成サービスの設計ドキュメント群のエントリーポイント。要件定義は [doc/requirements.md](../requirements.md) を参照。

## 設計ドキュメント一覧

| ドキュメント | 概要 |
|---|---|
| [app-architecture.md](./app-architecture.md) | アプリ構成、ディレクトリ構造、ルーティング、レンダリング戦略、状態管理 |
| [api-design.md](./api-design.md) | Server Actions / Route Handlers 一覧、入出力契約、エラー仕様、認可 |
| [db-design.md](./db-design.md) | Supabase (PostgreSQL) スキーマ、テーブル定義、ER 図、インデックス |
| [supabase-design.md](./supabase-design.md) | Supabase Auth 設定、RLS ポリシー、Storage バケット、Image Transformation |
| [frontend-design.md](./frontend-design.md) | 画面構成、コンポーネント階層、UI フロー、近接ボタン、ウィザード、関係付け |
| [styling-design.md](./styling-design.md) | デザインシステム、カラー、タイポグラフィ (CSS Modules + Custom Properties) |
| [billing-design.md](./billing-design.md) | Stripe 連携、プラン、Webhook、上限チェック、降格・解約フロー |
| [tree-visualization-design.md](./tree-visualization-design.md) | ツリーレイアウトアルゴリズム、特殊ケース表現、タイムライン連動 |
| [infra-design.md](./infra-design.md) | Vercel デプロイ、環境変数、CI/CD、ブランチ→環境マッピング |
| [security-design.md](./security-design.md) | 認証フロー、認可、共有 URL トークン、Webhook 署名、脆弱性対策 |

---

## 1. 要件サマリ

家系図作成サービスは、個人ユーザーが自分のルーツや家族構成を視覚的・構造的に記録し、写真やエピソードと共に後世に残せる Web サービスである。

### 主要機能 (MVP)
- 認証 (メール+PW / Google OAuth)
- 家系図 (Tree) の作成・編集・削除
- 人物 (Person) の登録・編集・削除 (氏名・続柄・婚姻・養子縁組・写真・エピソード・経歴)
- 縦型ツリーによるインタラクティブ表示 (ズーム・パン・近接ボタン)
- 複数配偶者 / 再婚 / 養子・連れ子 / 同性パートナー等の特殊ケース対応
- タイムライン表示 + 写真自動切替
- PDF / PNG エクスポート
- URL リンクによる閲覧共有 (作成者のみ編集)
- フリーミアム課金 (Free / Basic / Standard / Enterprise) — Stripe 連携

### 利用規模
- 1 家系数十人程度
- ターゲット: 個人ユーザー
- 数千人規模の家系研究は対象外

### 主要な非機能要件
- 数十人規模の家系図を 3 秒以内に表示 (NFR-P1)
- 操作レスポンス 1 秒以内 (NFR-P2)
- スタイリングは CSS Modules + CSS Custom Properties (Tailwind 禁止)
- セキュリティ: RLS による隔離、共有 URL の推測困難トークン、Stripe Webhook 署名検証

詳細は [doc/requirements.md](../requirements.md) を参照。

---

## 2. 全体アーキテクチャ

### システム構成
```
┌─────────────────────┐         ┌─────────────────────┐
│      Browser        │  HTTPS  │       Vercel        │
│  (Next.js Client)   │◀───────▶│  Next.js (App Router)│
└─────────────────────┘         │  - Server Components│
        ▲                       │  - Server Actions   │
        │ direct upload         │  - Route Handlers   │
        │ (signed URL)          └──────────┬──────────┘
        ▼                                  │
┌─────────────────────┐                    │
│  Supabase Storage   │◀───────────────────┤
│  (photos bucket)    │                    │
└─────────────────────┘                    │
        ▲                                  ▼
        │ Image Transformation   ┌─────────────────────┐
        └────────────────────────│   Supabase Auth     │
                                 │   Supabase DB (RLS) │
                                 └─────────────────────┘
                                            │
                                            ▼ Webhook
                                 ┌─────────────────────┐
                                 │       Stripe        │
                                 │  Checkout / Portal  │
                                 │  Subscription       │
                                 └─────────────────────┘
```

### 技術スタック
| 層 | 採用技術 |
|---|---|
| フロントエンド | Next.js (App Router) + React + TypeScript |
| スタイリング | CSS Modules + CSS Custom Properties (Tailwind 禁止) |
| 状態管理 | Server Components + Zustand (ツリーページ局所) + react-hook-form |
| バリデーション | zod (Server / Client 共通スキーマ) |
| バックエンド (API) | Server Actions (主) + Route Handlers (Webhook / 署名 URL / Export) |
| DB / Auth / Storage | Supabase (PostgreSQL + Auth + Storage) |
| 認証 | Supabase Auth (メール+PW + Google OAuth) |
| 課金 | Stripe (Checkout / Customer Portal / Webhook) |
| ホスティング | Vercel (東京リージョン) |
| テスト | Jest + React Testing Library / Playwright (E2E) |
| タスク管理 | Beads |

---

## 3. アーキテクチャ方針 (重要決定事項)

### ディレクトリ構造
- `src/app/` に Route Group `(auth)` / `(main)` + 公開ルート `/share/[token]`
- `features/` (ドメイン別: tree / person / photo / relation / timeline / share / export / billing / auth / onboarding)
- `components/` (共有 UI: ui / layout / feedback)
- `lib/` (supabase / stripe / auth / plan / date / logger)
- 詳細: [app-architecture.md](./app-architecture.md#1-ディレクトリ構造)

### Supabase クライアント分離
- `lib/supabase/server.ts` (server-only, Service Role 含む)
- `lib/supabase/client.ts` (ブラウザ)
- `lib/supabase/middleware.ts` (middleware.ts 専用)
- Service Role の用途は共有ビュー / Webhook / Export のみに限定

### ルーティング・認証保護
- `(main)` 配下は **`middleware.ts` (Edge) + `(main)/layout.tsx` (Server)** で二重防衛
- 共有 URL `/share/[token]` は middleware から除外。Server 側でトークン検証 → Service Role で取得

### データ取得・更新
- Mutation は基本 **Server Actions**
- Route Handlers は Stripe Webhook / Storage 署名 URL / PDF・PNG エクスポートに限定
- 初期データは Server Components で並列フェッチ (`await Promise.all`)
- リアルタイム同期は MVP 不要 (楽観的 UI + `revalidatePath`)

### レンダリング戦略
- ランディング / 料金 / 規約 → SSG
- ダッシュボード / ツリー編集 / 共有 / 課金 → SSR (+ Client Component)
- 共有ビューは `generateMetadata` で OGP 必須

### 状態管理
- ツリー編集の選択ノード・パネル開閉・現在年は **Zustand (ツリーページに限定)**
- ズーム/パンは React state (ローカル)
- フォームは react-hook-form + zod、サーバーバリデーションも同一スキーマ

### Stripe
- Webhook: Route Handler で `req.text()` + 署名検証 + `billing_event` で冪等性
- Checkout 作成は Server Action (idempotencyKey で二重課金防止)
- プラン上限は `lib/plan/limits.ts` で集約 (人物 / 写真 / ツリーの 3 入口)

### 共有 URL
- ULID + 256bit ランダム接尾辞をハッシュ化したトークン
- Service Role 経由でデータ取得 (RLS バイパス)
- 無効化・再発行可

---

## 4. 主要ユーザーフロー (高レベル)

### 新規登録 → 初回家系図作成
```
[/signup] → メール確認 → [/auth/callback]
  → DB トリガで profile + subscription(free) 作成
  → [/onboarding] ウィザード (自分 → 両親 → 兄弟姉妹 → 配偶者 → 子)
  → [/trees/[id]] ツリー編集画面
```

### 人物追加 (近接ボタン)
```
[ノードホバー] → [+ 親 / + 子 / + 配偶者]
  → PersonForm モーダル
  → quickAddRelative Server Action
    → プラン上限チェック
    → person + relation INSERT
    → revalidatePath
```

### 課金アップグレード
```
[/pricing] → Checkout ボタン
  → createCheckoutSession Server Action
  → Stripe Checkout (外部画面)
  → 戻り → [/account/billing]
  ↓ 並行
  Stripe → /api/stripe/webhook
    → billing_event INSERT (冪等)
    → subscription 更新
```

### 共有閲覧
```
作成者: [/trees/[id]/share] → enableShare → token 発行
  → URL を家族に渡す
家族: [/share/[token]]
  → 公開 SSR (Service Role) → 閲覧専用画面
```

---

## 5. ドキュメント横断のオープン事項

各ドキュメント末尾に「オープン事項」セクションを設けてある。代表的な未確定事項:

### 設計判断が残るもの
- ツリー描画ライブラリの最終選定 (自前 SVG / react-flow): [tree-visualization-design.md](./tree-visualization-design.md#11-オープン事項)
- ズーム/パンライブラリ選定: 同上
- PDF/PNG エクスポートの実装方式 (puppeteer / @vercel/og / クライアント html-to-image): [api-design.md](./api-design.md#9-オープン事項)
- エピソード本文のフォーマット (プレーン / Markdown): [db-design.md](./db-design.md#8-オープン事項), [security-design.md](./security-design.md#19-オープン事項)
- ダークモード対応の有無: [styling-design.md](./styling-design.md#10-オープン事項)

### 運用方針が残るもの
- Sentry 等監視ツールの導入時期: [infra-design.md](./infra-design.md#10-オープン事項)
- Storage オーファン (DB 未登録オブジェクト) の掃除方式: [supabase-design.md](./supabase-design.md#7-オープン事項)
- Soft delete vs 物理削除: [db-design.md](./db-design.md#8-オープン事項)
- 共有 URL のレート制限実装可否 (Upstash Redis): [security-design.md](./security-design.md#19-オープン事項)
- past_due の正確な猶予日数 (Stripe Smart Retries): [billing-design.md](./billing-design.md#12-オープン事項)
- Supabase マイグレーションの CI 自動化: [infra-design.md](./infra-design.md#10-オープン事項)

### 拡張性に関わるもの
- 100 人超の家系図への WebWorker レイアウト計算: [tree-visualization-design.md](./tree-visualization-design.md#11-オープン事項)
- 年額プラン・無料トライアルの将来追加: [billing-design.md](./billing-design.md#12-オープン事項)
- 存命者の同意確認フラグ (R-3): [security-design.md](./security-design.md#19-オープン事項)

PM はこれらのオープン事項をユーザーと確認のうえ、必要に応じて Beads タスクとして登録すること。

---

## 6. 次フェーズへの引き継ぎ

1. オープン事項のうち、設計上ブロッカーとなる項目をユーザーに確認
2. 確定事項を該当ドキュメントに反映
3. Beads でタスク分解 (フェーズ別 / ドメイン別)
4. `/dev-start` で開発パイプラインを起動
