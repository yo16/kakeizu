# 課金設計 (Billing Design)

## 概要
Stripe を用いたサブスクリプション課金の連携設計。Checkout / Customer Portal / Webhook、プラン上限チェック、降格処理、冪等性確保の方針を定義する。

## 対象範囲
プラン管理、Checkout/Portal フロー、Webhook 処理、上限チェック、降格・解約・支払い失敗の状態遷移。

## 他ドキュメントとの関係
- DB 設計 (`plan` / `subscription` / `billing_event`): [db-design.md](./db-design.md)
- API 設計 (Webhook / Server Actions): [api-design.md](./api-design.md)
- セキュリティ (署名検証): [security-design.md](./security-design.md)
- フロントエンド (UI): [frontend-design.md](./frontend-design.md)

---

## 1. プラン定義

| プラン | 月額 (内税) | max_trees | max_persons_per_tree | max_photos_per_person | Stripe Price |
|---|---|---|---|---|---|
| Free | ¥0 | 1 | 5 | 2 | (なし) |
| Basic | ¥500 | 2 | 20 | 5 | `price_basic_jpy_monthly` |
| Standard | ¥2,000 | 5 | 40 | 10 | `price_standard_jpy_monthly` |
| Enterprise | 個別見積 | -1 (無制限) | -1 / 40 超 | -1 / 10 超 | (手動契約) |

- `-1` は「無制限」を表す内部規約
- DB の `plan` テーブルに seed として投入
- Enterprise は MVP では問い合わせ窓口に誘導 (FR-B11)

### 料金表示 (FR-B2)
- 内税表示・固定価格
- 通貨は JPY 固定。Stripe Price も JPY で作成
- Stripe Tax は **使用しない** (MVP)

---

## 2. 状態モデル (`subscription.status`)

| 値 | 意味 | アプリ動作 |
|---|---|---|
| `active` | 有効 | 通常運用 |
| `past_due` | 支払い失敗中 (リトライ期間) | 現プランを維持。バナーで支払い更新を促す |
| `canceled` | 解約 (期間終了後 Free) | 期間終了まで現プラン、終了後 Free |
| `incomplete` | 初回支払い未完了 | Free 扱い |

### 状態遷移
```
[Free active]
   │ Checkout 成功 (checkout.session.completed)
   ▼
[Paid active]
   │ payment failed (invoice.payment_failed)
   ▼
[Paid past_due] ── retry success ──▶ [Paid active]
   │ retry timeout (subscription.deleted)
   ▼
[Free active]   ※ downgraded_at をセット

[Paid active]
   │ ユーザー解約 (subscription.updated cancel_at_period_end=true)
   ▼
[Paid canceled (期間内)]
   │ 期間終了 (subscription.deleted)
   ▼
[Free active]   ※ downgraded_at をセット
```

---

## 3. Checkout フロー

### Server Action `createCheckoutSession`
1. ユーザー認証チェック
2. `subscription.stripe_customer_id` がなければ Stripe で Customer 作成 → DB に保存
3. `stripe.checkout.sessions.create` を呼ぶ
   - `mode: 'subscription'`
   - `line_items: [{ price: priceId, quantity: 1 }]`
   - `customer: stripe_customer_id`
   - `success_url: {origin}/account/billing?status=success`
   - `cancel_url: {origin}/pricing?status=canceled`
   - `client_reference_id: userId`
   - `subscription_data: { metadata: { user_id: userId, plan_id: targetPlanId } }`
   - **idempotencyKey** に `userId + priceId + minute` のハッシュを使い、二重課金を防ぐ
4. 返り値の `url` をクライアントに返し、リダイレクト

### Customer Portal
- Server Action `createCustomerPortalSession` で `stripe.billingPortal.sessions.create({ customer, return_url })`
- プラン変更・解約・支払い方法更新・請求履歴を Stripe 側に委譲 (FR-B6)

---

## 4. Webhook 処理

### エンドポイント
- `POST /api/stripe/webhook` (Node Runtime)
- 署名検証: `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
- 失敗時 `400` を返す

### 冪等性
1. `event.id` を `billing_event` テーブルに INSERT 試行 (UNIQUE 制約)
2. 重複なら `200` を即返す (再処理せず)
3. 成功なら処理を継続

### 対応イベント

| イベント | 処理 |
|---|---|
| `checkout.session.completed` | `subscription` を取得し、Customer ID と Subscription ID を `subscription` テーブルに反映。`plan_id` をメタデータから取得 |
| `customer.subscription.created` | 新規契約。`subscription` 行を `status='active'` で更新 |
| `customer.subscription.updated` | プラン変更 / `cancel_at_period_end` の反映。`current_period_end` 更新 |
| `customer.subscription.deleted` | 期間終了 or リトライ失敗 → Free に降格。`downgraded_at = now()`、`stripe_subscription_id = null` |
| `invoice.payment_failed` | `status='past_due'` に更新。バナー表示用 |
| `invoice.payment_succeeded` | `status='active'` に戻す |

### 失敗時の方針
- 想定外エラーは Sentry 等にログを残し、HTTP 500 を返す → Stripe が自動リトライ
- 5xx 応答による無限リトライを避けるため、業務ロジック失敗 (例: ユーザー不在) は 200 を返してログだけ残す

---

## 5. プラン上限チェック (`lib/plan/limits.ts`)

### 共通インターフェース
```ts
export type LimitCheckTarget =
  | { kind: 'tree'; userId: string }
  | { kind: 'person'; userId: string; treeId: string }
  | { kind: 'photo'; userId: string; personId: string };

export async function assertWithinLimit(target: LimitCheckTarget): Promise<void>;
// 違反時は ActionError({ code: 'PLAN_LIMIT_EXCEEDED', message }) をスロー
```

### 実装方針
1. `subscription` を取得 (Service Role 不要、ユーザー自身の取得)
2. `plan` を JOIN で取得
3. `kind` に応じて現件数を SQL で COUNT
4. `max_*` と比較 (-1 は無制限)
5. 違反時はカスタムエラー
6. 呼び出し箇所:
   - `createTree` (`tree`)
   - `createPerson`, `quickAddRelative` (`person`)
   - `/api/storage/signed-upload`, `registerPhotoAfterUpload` (`photo`)

### 二重チェック方針
- 署名 URL 発行時 (アップロード前) と DB 登録時 (アップロード後) の両方でチェック
- 並行アップロード時の race を防ぐため、DB 登録時は `INSERT ... WHERE (count) < limit` のように排他制御を検討 (オープン事項)

---

## 6. 降格・超過状態の扱い (FR-B10)

### 降格時の処理
- Webhook で `status` を遷移させ、`subscription.plan_id = 'free'` に更新
- 既存データは削除しない
- 上限超過は次の操作時にチェックされる
  - 既存件数 > 新上限 のとき新規作成系 Action はすべて拒否
  - 閲覧・エクスポートは許可
- UI: `OverLimitBanner` をダッシュボードとツリー編集画面に表示 (現件数 / 上限値 / アップグレード CTA)

### 降格対象データの選定
- 自動削除しない (家族の写真は感情的負荷が大きい)
- ユーザー自身に「不要な人物・写真を削除」または「アップグレード」を選択させる

---

## 7. 支払い失敗のリトライ猶予 (FR-B8 / O-7)
- Stripe の Smart Retries 標準設定に準拠 (デフォルト: 最大 4 回 / 約 3 週間)
- 期間中: `status='past_due'` を維持。バナー表示
- 期間終了: `customer.subscription.deleted` 受信 → Free に降格
- 具体的な日数は Stripe ダッシュボードで設定し、ドキュメントに記録 (オープン事項)

---

## 8. 解約フロー (FR-B9)
- ユーザーが Customer Portal から解約
- Webhook `customer.subscription.updated` で `cancel_at_period_end=true` を反映
- 期間終了まで現プラン維持
- `customer.subscription.deleted` で Free 降格

---

## 9. アカウント削除と Stripe 連携
- `deleteAccount` Server Action 内で `stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false })`
- 失敗してもアプリ側 DB の削除は続行 (Stripe 側は手動オペレーション可)
- Customer は残してもよい (Stripe 側のオペレーション簡略化)。具体方針はオープン事項

---

## 10. UI (詳細は frontend-design 参照)
- `/pricing`: プラン比較表 → Checkout 起動
- `/account/billing`: 現プラン / 次回課金日 / 「プラン変更・解約 (Customer Portal)」ボタン
- 上限到達時: `PlanLimitDialog` (各機能内)
- past_due 時: グローバルバナーで支払い更新を促す
- Enterprise: 「お問い合わせ」フォーム or mailto

---

## 11. テスト方針
- Stripe CLI (`stripe listen`) でローカル Webhook 受信
- Webhook ハンドラの単体テストはイベントペイロード固定 + DB モックで実施
- 上限チェックは境界値テスト (上限 -1, 上限, 上限 +1)
- 冪等性テスト: 同じ event.id を 2 回処理して片方のみ反映されることを確認

---

## 12. オープン事項
- O-B1: 並行アップロード race の排他制御方式 (DB CHECK + 行ロック / 楽観ロック)
- O-B2: アカウント削除時に Stripe Customer も削除するか
- O-B3: past_due の正確な猶予日数 (Stripe Smart Retries の設定値) の決定
- O-B4: Enterprise 問い合わせ受付窓口の実装 (メール / フォーム / 別 SaaS)
- O-B5: 年額プラン・無料トライアルの将来追加に備えた DB 拡張余地 (現状は月額のみ)
- O-B6: 請求書 PDF や領収書ダウンロードを自前実装するか (現状は Stripe Customer Portal に委譲)
- O-B7: プラン変更時 (Basic→Standard 等) の差額計算は Stripe の Proration デフォルトで良いか
