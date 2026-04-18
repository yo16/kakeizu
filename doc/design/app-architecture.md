# アプリ構成設計 (App Architecture)

## 概要
Next.js (App Router) を用いた家系図サービスのアプリケーション構成、ディレクトリ構造、ルーティング、レンダリング戦略、状態管理方針を定義する。

## 対象範囲
ディレクトリ構造 / Route Group / レンダリング戦略 (SSR/SSG/CSR) / 認証保護 / 状態管理 / フォーム / バリデーション。

## 他ドキュメントとの関係
- API 詳細: [api-design.md](./api-design.md)
- フロントエンド (UI) 詳細: [frontend-design.md](./frontend-design.md)
- ツリー描画詳細: [tree-visualization-design.md](./tree-visualization-design.md)
- 認証フロー詳細: [security-design.md](./security-design.md)

---

## 1. ディレクトリ構造

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 認証前 Route Group (公開ページ)
│   │   ├── layout.tsx            # 認証画面用レイアウト
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── auth/callback/route.ts  # OAuth コールバック (Route Handler)
│   ├── (main)/                   # 認証必須 Route Group
│   │   ├── layout.tsx            # セッション確認 + 共通ヘッダー
│   │   ├── dashboard/page.tsx    # ツリー一覧・新規作成
│   │   ├── trees/
│   │   │   ├── new/page.tsx      # 新規ツリー作成 (ウィザード起点)
│   │   │   └── [treeId]/
│   │   │       ├── page.tsx      # ツリー編集画面
│   │   │       ├── settings/page.tsx
│   │   │       ├── share/page.tsx
│   │   │       └── export/page.tsx
│   │   ├── account/
│   │   │   ├── page.tsx          # アカウント情報
│   │   │   └── billing/page.tsx  # プラン・課金
│   │   └── onboarding/page.tsx   # 初回ウィザード (FR-V6)
│   ├── share/[token]/            # 公開閲覧ルート (未認証可)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/                      # Route Handlers
│   │   ├── stripe/
│   │   │   ├── webhook/route.ts
│   │   │   └── checkout/route.ts (Server Action ベースだが補助 API として残す)
│   │   ├── storage/
│   │   │   └── signed-upload/route.ts  # Storage 署名 URL 発行
│   │   └── export/
│   │       ├── pdf/route.ts
│   │       └── png/route.ts
│   ├── layout.tsx                # ルートレイアウト (フォント・グローバル CSS)
│   ├── page.tsx                  # ランディング (SSG)
│   ├── pricing/page.tsx          # 料金ページ (SSG)
│   ├── terms/page.tsx
│   ├── privacy/page.tsx
│   └── not-found.tsx
├── features/                     # ドメイン別機能モジュール
│   ├── tree/
│   │   ├── components/           # 機能専用コンポーネント
│   │   ├── actions/              # Server Actions
│   │   ├── hooks/
│   │   ├── stores/               # Zustand store
│   │   ├── types.ts
│   │   └── schemas.ts            # zod スキーマ
│   ├── person/
│   ├── photo/
│   ├── relation/
│   ├── timeline/
│   ├── share/
│   ├── export/
│   ├── billing/
│   └── auth/
├── components/                   # アプリ横断の共有 UI
│   ├── ui/                       # ボタン・入力・モーダル等の汎用 UI
│   ├── layout/                   # ヘッダー・フッター・サイドバー
│   └── feedback/                 # トースト・エラー画面
├── lib/                          # 外部サービス・ユーティリティ
│   ├── supabase/
│   │   ├── server.ts             # server-only (Service Role 含む)
│   │   ├── client.ts             # ブラウザ用
│   │   └── middleware.ts         # middleware.ts 用 (cookie ベース)
│   ├── stripe/
│   │   ├── server.ts             # server-only
│   │   └── client.ts             # @stripe/stripe-js
│   ├── auth/
│   │   └── session.ts            # セッション取得ヘルパー
│   ├── plan/
│   │   └── limits.ts             # プラン上限チェック共通関数
│   ├── date/
│   │   └── partial-date.ts       # 曖昧な日付ユーティリティ
│   └── logger.ts
├── styles/                       # グローバル CSS / カスタムプロパティ
│   ├── globals.css
│   ├── tokens.css                # CSS Custom Properties (color/space/font)
│   └── reset.css
├── types/                        # 横断的な型定義
│   └── database.ts               # Supabase 自動生成型
└── middleware.ts                 # Edge ミドルウェア (認証保護)
```

### 構造の方針
- **Route Group** で「認証前 (auth)」「認証後 (main)」を分離。各レイアウトでセッション処理を切り替える。
- **`features/`** はドメイン (tree / person / photo …) ごとに `components / actions / hooks / schemas` をまとめる。横断的に再利用される UI のみ `components/` に置く。
- **`lib/supabase/server.ts`** は `import 'server-only'` 宣言を入れ、誤ってクライアントへバンドルされないようにする。Service Role Key を使うクライアントは別関数 `createServiceRoleClient()` として明示。
- **公開ルート** は Route Group 外の `share/[token]/` に置き、認証保護の middleware 対象から除外する。

---

## 2. ルーティング設計

| パス | 認証 | レンダリング | 主目的 |
|---|---|---|---|
| `/` | 不要 | SSG | ランディング |
| `/pricing` | 不要 | SSG | 料金ページ |
| `/terms`, `/privacy` | 不要 | SSG | 規約・プライバシー |
| `/login`, `/signup`, `/forgot-password` | 不要 | SSR | 認証画面 |
| `/auth/callback` | 不要 | Route Handler | OAuth コールバック |
| `/dashboard` | 必須 | SSR | ツリー一覧 |
| `/trees/new` | 必須 | SSR | ツリー新規作成 |
| `/trees/[treeId]` | 必須 | SSR (初期) + CSR (操作) | ツリー編集 |
| `/trees/[treeId]/settings` | 必須 | SSR | ツリー設定 |
| `/trees/[treeId]/share` | 必須 | SSR | 共有 URL 管理 |
| `/trees/[treeId]/export` | 必須 | SSR | エクスポート画面 |
| `/onboarding` | 必須 | SSR | 初回ウィザード |
| `/account` | 必須 | SSR | アカウント |
| `/account/billing` | 必須 | SSR | 課金管理 |
| `/share/[token]` | 不要 | SSR | 公開閲覧ビュー |
| `/api/stripe/webhook` | 不要 (署名検証) | Route Handler (Node Runtime) | Stripe Webhook |
| `/api/storage/signed-upload` | 必須 | Route Handler | Storage 署名 URL |
| `/api/export/{pdf,png}` | 必須 | Route Handler | エクスポート |

### 認証保護の二重防衛

1. **`middleware.ts`** (Edge Runtime)
   - `(main)` 配下と `/onboarding`, `/account` 系は未認証アクセスを `/login` にリダイレクト
   - Cookie のセッションを `@supabase/ssr` でリフレッシュ
   - JWT の検証が必要な箇所は `jose` を使用 (Edge では `@supabase/supabase-js` のフルクライアントは使わない)
2. **`(main)/layout.tsx`** (Server Component)
   - `getServerSession()` で再確認。失敗時は `redirect('/login')`
   - 取得した user 情報を Layout から下流の Server Components に props として渡す

### 共有 URL のルーティング
- `/share/[token]` は middleware の認証チェックから除外 (matcher の negative pattern で対応)
- ルート内で token をサーバー検証し、有効なら Service Role クライアントでツリー・人物・写真をフェッチ
- generateMetadata で OGP (タイトル / 説明 / 代表写真) を出力

---

## 3. レンダリング戦略 (SSR/SSG/CSR)

| ページ種別 | 戦略 | 理由 |
|---|---|---|
| ランディング / 料金 / 規約 | SSG | 静的・高頻度配信。CDN キャッシュ最大化 |
| 認証画面 | SSR | 動的リダイレクト判定 (既ログインなら dashboard へ) |
| ダッシュボード | SSR | ユーザー固有データ。Server Components で並列フェッチ |
| ツリー編集 | SSR (初期) + CSR (操作) | 初期データは SSR、ノード操作は Client + Server Actions |
| 共有ビュー | SSR | OGP 必須・SEO 不要だが SNS 共有でメタ重要 |
| 課金 | SSR | Subscription 状態を毎回確認 |

### Server Components / Client Components の分離
- デフォルトはすべて Server Component
- インタラクティブな部分のみ `'use client'` を宣言した子コンポーネントに切り出す
- ツリー編集ページの構成例:
  ```
  page.tsx (Server: 初期データフェッチ)
    └─ <TreeEditorShell /> (Client: Zustand 提供, ノード操作)
         ├─ <TreeCanvas /> (Client: SVG 描画)
         ├─ <DetailPanel /> (Client)
         └─ <TimelineBar /> (Client)
  ```
- データ更新時は `revalidatePath('/trees/[treeId]')` で SSR 部分も最新化

---

## 4. データ取得・更新パターン

### データ取得
- **初期ロード**: Server Component から `await Promise.all([...])` で並列取得
- **クライアント追加取得**: 必要に応じて Server Actions を呼び出して再取得 (POST 不変なケースは Route Handler でも可)
- **リアルタイム同期**: MVP では不要。楽観的 UI + revalidate で対応

### データ更新 (Mutation)
- **基本は Server Actions** を使用
  - 人物の追加・編集・削除
  - 関係 (Relation) の登録・解除
  - 写真メタデータの更新
  - ツリーのタイトル・説明変更
  - 共有 URL の有効化・無効化・再発行
- **Route Handlers を使うケース**
  - Stripe Webhook (署名検証必須)
  - Storage 署名 URL 発行 (`/api/storage/signed-upload`)
  - PDF/PNG エクスポート (バイナリレスポンス)

### Server Action の構造
```
features/person/actions/createPerson.ts
  - 'use server'
  - zod スキーマでバリデーション (schemas.ts と共通)
  - getServerSession() で認可
  - lib/plan/limits.ts でプラン上限チェック
  - Supabase 経由で INSERT
  - revalidatePath('/trees/[treeId]')
  - 戻り値: { ok: true, data } | { ok: false, error }
```

### バリデーションの一元化
- `features/{domain}/schemas.ts` で zod スキーマを定義
- クライアント (react-hook-form) とサーバー (Server Action) で同じスキーマを利用
- DB 制約 (NOT NULL / CHECK) も同等の制約に揃える

---

## 5. 状態管理

| 状態 | 管理手段 | 理由 |
|---|---|---|
| 認証セッション | Server Component + Cookie | SSR で取得し props で配布 |
| ツリーデータ (永続) | Supabase + Server Actions | サーバー真実 |
| ツリー編集中の選択ノード / パネル開閉 / 現在年 | Zustand (ツリーページに限定) | 複数コンポーネント間の共有 |
| ズーム / パン | React state (TreeCanvas ローカル) | 単一コンポーネント内で完結 |
| フォーム入力 | react-hook-form + zod | 標準的かつ軽量 |
| トースト / モーダル | Zustand or React Context (UI 専用) | 横断利用 |

### Zustand store の分割方針
- ページ単位の store (`features/tree/stores/treeEditorStore.ts`) を作る
- グローバル store は作らず、ページ離脱時にリセット
- Server で取得した初期データは Provider 経由で store に流し込む

---

## 6. フォーム設計の共通方針
- すべてのフォームは `react-hook-form` + `@hookform/resolvers/zod`
- フィールドコンポーネントは `components/ui/form/` に統一
- エラー表示・ローディング・成功トーストの UI を共通化
- Server Action の戻り値が `{ ok: false, error }` の場合は `setError('root', ...)` で表示

---

## 7. エラーハンドリング
- ルートごとに `error.tsx` (Client) と `not-found.tsx` を配置
- Server Action は throw せず `{ ok: false, error: { code, message } }` を返す
- 致命的エラーは `app/error.tsx` でフォールバック
- Sentry 等の外部監査ツールは MVP 範囲外 (オープン事項)

---

## 8. パフォーマンス指針
- Server Component による HTML ストリーミングを活用
- 重いクライアントコード (ツリー描画ライブラリ等) は dynamic import
- 画像は Supabase Image Transformation の URL を `next/image` で配信
- Route Segment ごとに `revalidate` 値を設定 (主要編集系は no-store)

---

## 9. オープン事項
- O-A1: Edge ミドルウェアでの Supabase セッションリフレッシュの具体的なエラーハンドリング (リフレッシュトークン失効時の挙動)
- O-A2: Server Actions の単体テスト戦略 (Jest で Action を直接呼ぶか、結合テストに寄せるか)
- O-A3: 共有ビューの ISR/SSR 選択 (アクセス頻度次第で revalidate を入れるか)
- O-A4: エラー監視ツール導入の有無 (Sentry / LogRocket など) は MVP では未確定
- O-A5: ツリー編集画面の autosave 採否 (現状は明示保存ベース。autosave は将来検討の余地あり)
