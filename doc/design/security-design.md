# セキュリティ設計 (Security Design)

## 概要
認証フロー、RLS、Webhook 署名検証、共有 URL のトークン管理、脆弱性対策方針を定義する。

## 対象範囲
認証・認可 / セッション / RLS / 共有 URL セキュリティ / Webhook / Storage アクセス / 一般的脆弱性 (XSS, CSRF, SSRF) 対策。

## 他ドキュメントとの関係
- 認証実装: [supabase-design.md](./supabase-design.md)
- API 認可: [api-design.md](./api-design.md)
- 課金 Webhook: [billing-design.md](./billing-design.md)
- インフラ (環境変数): [infra-design.md](./infra-design.md)

---

## 1. 認証フロー

### メール+PW
1. `/signup` → Server Action `signUpWithPassword` → Supabase Auth
2. メール確認リンク → `/auth/callback` で `exchangeCodeForSession`
3. セッション Cookie 発行 → `/dashboard` へ
4. 新規ユーザーは DB トリガで `profile` + `subscription(plan_id='free')` 作成
5. 未オンボーディングなら `/onboarding`

### Google OAuth
1. `/login` → Google ボタン → `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })`
2. Google 認可 → コールバック → 同上

### パスワードリセット
- `requestPasswordReset` Server Action → Supabase Auth がメール送信
- リセットリンク → 専用ページで新パスワード設定

### サインアウト
- Server Action でセッションを破棄、Cookie をクリア

### アカウント削除 (FR-U3)
- `deleteAccount` Server Action 内で:
  1. パスワード or メール確認 (UI で再認証)
  2. Stripe Subscription があれば cancel
  3. Service Role で `auth.admin.deleteUser(id)`
  4. CASCADE で関連データ全削除
  5. Storage の `photos/{userId}/` を Service Role 経由で一括削除
  6. ログイン画面へリダイレクト

---

## 2. セッション管理
- Supabase Auth + `@supabase/ssr` の Cookie ベース
- `middleware.ts` で毎リクエスト Cookie を更新
- JWT の expiry は標準 (1h)、Refresh Token Rotation を ON
- 認証保護は二重 (middleware + (main)/layout)
- リフレッシュ失敗 (リフレッシュトークン失効) 時は `/login?reason=session_expired` にリダイレクト

---

## 3. 認可 (Authorization)

### 二層防御
1. **アプリ層**: Server Action / Route Handler の冒頭で `getServerSession()` チェック + リソース所有確認
2. **DB 層**: RLS で「他ユーザーのデータは絶対に見えない」状態を保証

### 共有 URL の例外処理
- `/share/[token]` 経由のみ Service Role を使用
- Service Role 利用箇所は限定し、コードレビューで監視
- Service Role クライアント生成関数は `lib/supabase/server.ts` 内 `createServiceRoleClient()` の 1 箇所のみ
- `import 'server-only'` で誤バンドル防止

---

## 4. RLS (詳細は supabase-design 参照)
- 全 public スキーマで RLS 有効化
- `tree.owner_user_id = auth.uid()` を起点に、子テーブルは EXISTS でチェック
- Storage は `storage.objects` の RLS でパス検証
- RLS バイパスは Service Role に限定

---

## 5. 共有 URL のセキュリティ (FR-S1〜S3, NFR-S2)

### トークン生成
- 生成方式: **ULID + 256bit ランダム接尾辞** をハッシュ化したものを保存
  - 例: `01HV8X...` (ULID, 26 文字) + base32 エンコードされた 32 byte ランダム
  - `share_link.token` には URL 安全文字列で保存
- 衝突リスクは極小だが INSERT 時に UNIQUE 違反でリトライ
- 推測困難 (NFR-S2 充足)

### 検証
- Server Component (`/share/[token]`) で `share_link.token = ?` を検索
- `is_enabled = true` のみ閲覧可
- `revoked_at IS NULL` も条件
- 一致しなければ `notFound()`
- レート制限: 同一 IP からの大量試行があれば 429 (オープン事項。MVP では未実装)

### 無効化
- `disableShare` Action: `is_enabled=false`, `revoked_at=now()`
- `regenerateShare`: 既存行を無効化し、新トークンを INSERT (UNIQUE のため必ず別行)

### 配布範囲の警告
- 共有ビュー上に「URL を知る人は誰でも閲覧できます」の注意を表示
- 利用規約に「URL の取り扱いはユーザーの責任」と明示 (NFR-S4)

---

## 6. Stripe Webhook の署名検証 (FR-B12, NFR-S6)
- `req.text()` で raw body を取得 (Next.js は自動 JSON パースを行わないよう Route Handler 内で明示)
- `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` で検証
- 検証失敗 → `400`
- Webhook シークレットは環境変数 (Server only)
- Webhook URL はインフラドキュメント参照

---

## 7. クライアントへのシークレット露出防止 (FR-B12)
- `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` は `NEXT_PUBLIC_` プレフィックスを付けない
- `lib/env.ts` で zod 検証 + `import 'server-only'` 宣言
- ESLint ルールで `process.env.STRIPE_SECRET_KEY` を `client` ファイルから参照不可に (推奨)

---

## 8. 入力バリデーション
- すべての Server Action・Route Handler で zod スキーマ検証
- DB 制約 (CHECK, NOT NULL) を多重防御として併用
- ファイルアップロード:
  - MIME ホワイトリスト (`image/jpeg`, `image/png`, `image/webp`)
  - サイズ上限
  - 拡張子 + MIME の二重確認

---

## 9. XSS / インジェクション対策
- React の自動エスケープに依存
- `dangerouslySetInnerHTML` は原則禁止
- エピソード本文 (FR-P2) はプレーンテキスト保存とし、Markdown を使う場合は `react-markdown` + sanitize plugin を使用 (オープン事項)
- SQL は Supabase クライアント (パラメータ化) のみ。生 SQL は Service Role に限定

---

## 10. CSRF 対策
- Server Actions は Next.js が自動的に Origin チェックを行う (App Router の Same-Origin)
- カスタム Route Handler (POST 系) は `Origin` ヘッダ検証 or Cookie + Token ペア (現状は Same-Origin 前提で省略)
- Stripe Webhook は署名検証で代替

---

## 11. SSRF / 外部呼び出し
- Stripe API: ライブラリ経由 (`stripe-node`)
- Supabase: クライアント経由
- 任意 URL を fetch する処理は実装しない (画像配信は Supabase Image Transformation のみ)

---

## 12. パスワードポリシー
- Supabase Auth 標準 (8 文字以上)
- Common password チェックは Supabase Auth 設定で ON (利用可能なら)
- ハッシュ化はライブラリ標準 (bcrypt) に委譲 (NFR-S3)

---

## 13. レート制限
- MVP では未実装 (オープン事項)
- 実装時の優先候補:
  - 認証エンドポイント (Supabase Auth が標準で備える brute-force 抑制)
  - 写真アップロード署名 URL
  - 共有 URL アクセス

---

## 14. ログ・監査
- Webhook イベントは `billing_event` に保存
- アカウント削除・共有 URL 発行・解約はアプリログに残す (Vercel logs)
- 個人情報を含む詳細データはログに出さない (氏名・メール等を avoid)

---

## 15. データ保護
- 個人情報は Supabase 内に保存 (NFR-S4)
- 利用規約・プライバシーポリシーで取扱範囲を明示
- 写真は Storage Private バケット + 署名 URL 配信
- バックアップは Supabase 標準

---

## 16. クレジットカード情報 (NFR-S5)
- アプリは一切保持しない
- すべて Stripe Checkout / Customer Portal で完結
- カード情報の DOM は Stripe.js が iframe で隔離

---

## 17. 脆弱性監視・依存性更新
- Dependabot 等で依存パッケージを更新 (オープン事項)
- 主要ライブラリ: Next.js, @supabase/*, stripe-node, react

---

## 18. 法的事項
- 利用規約・プライバシーポリシーを公開 (`/terms`, `/privacy`)
- 個人情報保護法 (日本) を念頭に運用
- 写真の被写体 (家族など) の同意取得はユーザー責任とする (R-3)

---

## 19. オープン事項
- O-SE1: 共有 URL のレート制限 (MVP 未実装。Upstash Redis 等で実装するか)
- O-SE2: 存命者の同意フラグ (要件 R-3) を将来追加するか / どこに表示するか
- O-SE3: エピソード本文の Markdown 採否 (採用時は sanitize 必須)
- O-SE4: Sentry 等の監視ツール導入時の PII マスキングルール
- O-SE5: アカウント削除リクエストから完全削除までの SLA 表記 (利用規約)
- O-SE6: ESLint で Server only 変数のクライアント参照を機械的に禁止する仕組みの導入
- O-SE7: 共有 URL アクセスログを残す場合の保存期間と暗号化方針
