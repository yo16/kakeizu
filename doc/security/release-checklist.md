# リリース前セキュリティチェックリスト

実施日: 2026-04-28
ブランチ: `feature/bd-kakeizu-fga.3`
担当: security-specialist (PM 監修)

## 確認結果サマリー

| 区分 | 件数 |
|---|---|
| OK | 10 |
| 要対応 (High) | 1 (`deleteAccount` の Stripe キャンセル未実装) |
| 要対応 (Medium) | 1 (`env.ts` の `server-only` 欠如) |
| 情報 (Moderate のみ) | 1 (`npm audit`: postcss/next の Moderate 2件) |

**リリース判定: 条件付き可**

High 相当の `deleteAccount` における Stripe サブスクリプションキャンセル未実装は、有料ユーザーへの課金継続リスクがあるためリリース前に対処することを強く推奨。Beads タスクとして別途登録する。

---

## 認証・認可

### 1. RLS が全テーブルに設定されているか
**判定: OK**

- 確認手段: `grep -r "ENABLE ROW LEVEL SECURITY" supabase/migrations/`
- 全 12 テーブル (profile, plan, subscription, billing_event, tree, person, relation, photo, photo_person_link, share_link, onboarding_state, keepalive_ping) で `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を確認
- `billing_event` / `keepalive_ping` は RLS 有効化 + ポリシーなし (全ユーザー拒否、Service Role のみアクセス可) の正しい設計
- Storage バケット (`photos`) も `storage.foldername(name)[1] = auth.uid()::text` でパス別アクセス制御あり

### 2. 未認証ユーザーが保護 API にアクセスできないか
**判定: OK**

- 確認手段: `src/middleware.ts` を Read
- `PROTECTED_PATHS = ['/dashboard', '/trees', '/account', '/onboarding']` に対して `supabase.auth.getUser()` でセッション確認
- 未認証は `/login` へリダイレクト、リフレッシュトークン失効時は `/login?reason=session_expired`
- Stripe Webhook (`/api/stripe/webhook`) と OAuth コールバック (`/auth/callback`)、`/share/[token]` は性質上正しく除外

### 3. 他ユーザーのリソースアクセス禁止
**判定: OK**

- 確認手段: `grep -r "auth.uid()" supabase/migrations/`
- `profile`, `subscription`, `onboarding_state`: `auth.uid() = user_id` の直接 owner check
- `tree`: `auth.uid() = owner_user_id` の直接 owner check
- `person`, `relation`, `photo`, `photo_person_link`, `share_link`: `tree.owner_user_id = auth.uid()` を EXISTS サブクエリで間接 owner check
- Storage: `(storage.foldername(name))[1] = auth.uid()::text` でパスレベル owner check

---

## API セキュリティ

### 4. Stripe Webhook 署名検証
**判定: OK**

- 確認手段: `src/app/api/stripe/webhook/route.ts` を Read
- `req.text()` で raw body を取得、`stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` で署名検証
- `stripe-signature` ヘッダ不在時 / 検証失敗時 / `STRIPE_WEBHOOK_SECRET` 未設定時の各エラーハンドリングあり

### 5. Server Actions 認証チェック
**判定: OK**

- 確認手段: `grep -rl "getServerSession" src/features/*/actions/*.ts`
- データ操作系 Action (tree, person, relation, photo, share, billing) すべてで `getServerSession()` を冒頭で呼び出し、未取得時は `UNAUTHENTICATED` を返却
- 認証前 Action (sign-in, sign-up, request-password-reset, sign-out) のみ除外 (妥当)
- `getServerSession()` は内部で `supabase.auth.getUser()` (サーバー側 JWT 検証) を使用

### 6. SQL Injection
**判定: OK**

- 確認手段: `grep -r "rpc(" src/` (0件)、Server Actions 実装確認
- クエリビルダー (`supabase.from(...).select(...).eq(...).insert(...)`) のみ使用
- `rpc()` による生 SQL 直接渡しは皆無
- パラメータはすべて Supabase クライアントのバインド変数として処理

---

## 環境変数・シークレット

### 7. シークレット直書きなし
**判定: OK**

- 確認手段: `grep -r "sk_live_|sk_test_|whsec_" src/`
- 本番コードでのマッチゼロ
- テストファイル (`route.test.ts`) に `whsec_test_secret` あるがテスト用ダミーで問題なし
- `STRIPE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` は環境変数経由で参照

### 8. `.env.local` が `.gitignore` に含まれているか
**判定: OK**

- 確認手段: `.gitignore` を Read
- `.env*.local`, `.env.local`, `.env` を明示的に列挙
- `.env.local.example` と `.env.test.local.example` のみリポジトリに存在

### 9. `NEXT_PUBLIC_*` に機密が含まれていないか
**判定: OK**

- 確認手段: `grep -r "NEXT_PUBLIC_" src/ .env.local.example`
- 公開変数: 4 件のみ
  - `NEXT_PUBLIC_SUPABASE_URL` (Supabase プロジェクト URL、公開可)
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Publishable Key、公開可)
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Stripe 公開鍵、公開可)
  - `NEXT_PUBLIC_SITE_URL` (サイト URL、公開可)
- シークレット系 (`STRIPE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) は `NEXT_PUBLIC_` プレフィックスなし

---

## その他

### 10. HTTPS のみ
**判定: OK (確認不要)**

- Vercel デプロイによりデフォルトで HTTPS 強制
- カスタムドメイン設定時も Vercel が自動で TLS 証明書発行・更新

### 11. エラーメッセージにスタックトレース露出なし
**判定: OK**

- 確認手段: `grep -r "error.stack" src/`
- マッチゼロ。スタックトレースをクライアントに返す実装なし
- エラー時はサーバーログ (`console.error`) に出力、クライアントへは汎用メッセージのみ返却

### 12. 依存パッケージ脆弱性 (`npm audit --audit-level=high`)
**判定: OK (Moderate 2 件のみ、High なし)**

- 確認手段: `npm audit --audit-level=high --json`
- High 以上の脆弱性: 0 件
- Moderate 2 件:
  - `postcss < 8.5.10` — XSS via Unescaped `</style>` in CSS Stringify Output (CVSS 6.1)
  - `next >=9.3.4-canary.0` — postcss の依存経由
- Moderate は要件「High 以上なし」を満たすが、postcss の更新を検討すべき (`npm audit fix --force` で next 自体を 9.3.3 に下げる必要があり現実的でない。Next.js のメジャー更新待ち)

---

## 追加観察事項 (要対応)

### A. [High] `deleteAccount` の Stripe サブスクリプションキャンセル未実装

- 場所: `src/features/auth/actions/delete-account.ts:74` 付近
- 内容: アカウント削除時に Stripe の有効サブスクリプションをキャンセルする処理が TODO コメントのみで未実装
- リスク: 有料プランユーザーがアカウント削除すると Stripe 側でサブスクリプションが残存し課金継続。**ユーザーの経済的損害**につながる
- 対応方針: アカウント削除前に `stripe.subscriptions.cancel()` を呼び出し、確実にキャンセルする処理を実装
- → **別 Beads タスクとして登録予定**

### B. [Medium] `src/lib/env.ts` に `import 'server-only'` がない

- 場所: `src/lib/env.ts` 先頭
- 内容: `serverEnv` (`STRIPE_SECRET_KEY` 等を保持) を export しているが `import 'server-only'` の宣言なし
- リスク: クライアントコードから誤って `serverEnv` を import するとシークレットがバンドルに混入
- 対応方針: 先頭に `import 'server-only';` を追加。`clientEnv` を Client Component から参照している場合はファイル分割
- → **別 Beads タスクとして登録予定**

---

## 確認に使用した主要ファイル

- `doc/design/security-design.md`
- `supabase/migrations/` 全 15 ファイル
- `src/middleware.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/lib/auth/session.ts`
- `src/lib/supabase/server.ts`
- `src/lib/env.ts`
- `src/features/tree/actions/create-tree.ts`
- `src/features/auth/actions/delete-account.ts`
- `src/features/billing/actions/create-checkout-session.ts`
- `src/features/billing/actions/create-portal-session.ts`
- `src/features/share/lib/get-shared-tree.ts`
- `.gitignore`
- `.env.local.example`
- `package.json`
