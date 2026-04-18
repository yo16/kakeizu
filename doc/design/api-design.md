# API 設計 (API Design)

## 概要
Server Actions と Route Handlers の使い分け、エンドポイント一覧、入出力契約、エラーレスポンス、認可方針を定義する。

## 対象範囲
Server Actions / Route Handlers の API 全般。Stripe Webhook、Storage 署名 URL、PDF/PNG エクスポート、共有 URL 検証も含む。

## 他ドキュメントとの関係
- アプリ構成: [app-architecture.md](./app-architecture.md)
- DB 設計: [db-design.md](./db-design.md)
- 課金: [billing-design.md](./billing-design.md)
- セキュリティ: [security-design.md](./security-design.md)

---

## 1. 使い分け方針

### Server Actions を使うケース (Mutation 中心)
- フォーム送信ベースで、結果に応じて UI を更新するもの
- Cookie ベースの認証セッションを直接利用する
- `revalidatePath` / `revalidateTag` で SSR キャッシュを更新する

### Route Handlers を使うケース
- バイナリレスポンス (PDF, PNG)
- 第三者からの POST (Stripe Webhook)
- 認証以外のメカニズム (署名検証 / 共有トークン) で保護するもの
- ブラウザ以外のクライアントから叩く可能性があるもの

---

## 2. 共通仕様

### Server Action の戻り値
```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; field?: string } };
```

### Route Handler のレスポンス
- 正常: `200 OK` JSON `{ ok: true, data }` (バイナリは Content-Type で判定)
- バリデーションエラー: `400 Bad Request` `{ ok: false, error: {...} }`
- 認証エラー: `401 Unauthorized`
- 認可エラー: `403 Forbidden`
- リソース不在: `404 Not Found`
- 上限超過: `409 Conflict` (`code: PLAN_LIMIT_EXCEEDED`)
- サーバーエラー: `500 Internal Server Error`

### エラーコード
| コード | 意味 |
|---|---|
| `UNAUTHENTICATED` | セッション無効 |
| `FORBIDDEN` | 認可失敗 (他ユーザーの所有物) |
| `NOT_FOUND` | 対象不在 |
| `VALIDATION_ERROR` | 入力不正 (zod) |
| `PLAN_LIMIT_EXCEEDED` | プラン上限超過 |
| `SHARE_TOKEN_INVALID` | 共有トークン無効 |
| `RELATION_CONFLICT` | 関係矛盾 (循環参照等) |
| `STRIPE_ERROR` | Stripe 連携失敗 |
| `INTERNAL_ERROR` | 想定外エラー |

### 認可ポリシー
- すべての Server Action は冒頭で `getServerSession()` を呼び、未認証なら `UNAUTHENTICATED` を返す
- リソース操作前に「ログインユーザー == リソース所有者」を SQL レベル + アプリ層の両方でチェック
- 共有 URL 経由の閲覧専用 API はトークン検証のみで認証チェックをスキップ

---

## 3. Server Actions 一覧

### Auth (`features/auth/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `signInWithPassword` | `{ email, password }` | `void` (リダイレクト) | メール+PW サインイン |
| `signUpWithPassword` | `{ email, password }` | `void` | サインアップ |
| `signOut` | - | `void` | サインアウト |
| `requestPasswordReset` | `{ email }` | `void` | パスワードリセットメール送信 |
| `deleteAccount` | `{ confirmEmail }` | `void` | アカウント削除 (関連データ全削除) |

### Tree (`features/tree/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `createTree` | `{ title, description? }` | `{ treeId }` | 新規ツリー作成。プラン上限チェック |
| `updateTree` | `{ treeId, title?, description? }` | `void` | タイトル等更新 |
| `deleteTree` | `{ treeId }` | `void` | ツリー削除 (人物・写真も cascade) |
| `getTreeOverview` | `{ treeId }` | `{ tree, counts }` | 一覧用サマリ |

### Person (`features/person/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `createPerson` | `{ treeId, name, birth?, death?, ... }` | `{ personId }` | 人物追加。プラン上限チェック |
| `updatePerson` | `{ personId, ...patch }` | `void` | 編集 |
| `deletePerson` | `{ personId }` | `void` | 削除 (関連も cascade) |
| `setPrimaryPhoto` | `{ personId, photoId }` | `void` | 代表写真設定 |

### Relation (`features/relation/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `createParentChild` | `{ parentId, childId, parentRole: 'biological'|'adoptive', other? }` | `{ relationId }` | 親子関係 (循環チェック) |
| `createMarriage` | `{ partnerAId, partnerBId, type, startDate?, endDate?, status }` | `{ relationId }` | 婚姻関係 |
| `updateRelation` | `{ relationId, patch }` | `void` | 既存関係の更新 |
| `deleteRelation` | `{ relationId }` | `void` | 削除 |
| `quickAddRelative` | `{ originPersonId, kind: 'parent'|'child'|'spouse', personDraft }` | `{ personId, relationId }` | 近接ボタンからの一括登録 (FR-V5) |

### Photo (`features/photo/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `registerPhotoAfterUpload` | `{ treeId, storageObjectKey, takenAt?, caption?, personIds[] }` | `{ photoId }` | クライアントアップロード後にメタデータ登録 |
| `updatePhotoMeta` | `{ photoId, takenAt?, caption?, personIds[] }` | `void` | メタ更新 |
| `deletePhoto` | `{ photoId }` | `void` | 写真削除 (Storage と DB 両方) |

### Share (`features/share/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `enableShare` | `{ treeId }` | `{ token }` | 共有 URL を生成 (既存があれば返す) |
| `regenerateShare` | `{ treeId }` | `{ token }` | 旧トークン無効化 + 新規発行 |
| `disableShare` | `{ treeId }` | `void` | 無効化 |

### Billing (`features/billing/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `createCheckoutSession` | `{ priceId }` | `{ url }` | Stripe Checkout セッション作成 (idempotencyKey 使用) |
| `createCustomerPortalSession` | `{}` | `{ url }` | Customer Portal セッション作成 |

### Onboarding (`features/onboarding/actions/`)
| Action | 入力 | 出力 | 概要 |
|---|---|---|---|
| `submitOnboardingStep` | `{ step, data }` | `{ nextStep }` | ウィザード各ステップの保存 |
| `completeOnboarding` | `{ treeId }` | `void` | 完了フラグセット |

---

## 4. Route Handlers 一覧

### `POST /api/stripe/webhook`
- Runtime: **Node.js (Edge 不可)**
- 認証: Stripe 署名検証 (`STRIPE_WEBHOOK_SECRET`)
- Body: `req.text()` で生テキスト取得 → `stripe.webhooks.constructEvent`
- 冪等性: `BillingEvent` テーブルに `event.id` を UNIQUE で記録
- 対象イベント:
  - `checkout.session.completed`
  - `customer.subscription.created` / `updated` / `deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
- レスポンス: 常に `200`(処理失敗時もログだけ残し 200。リトライさせたい場合のみ 5xx)

### `POST /api/storage/signed-upload`
- 認証: ログイン必須
- 入力: `{ treeId, fileName, contentType, byteSize }`
- 処理:
  1. ツリー所有確認
  2. プラン上限チェック (写真枚数)
  3. `contentType` を JPEG/PNG/WebP に限定
  4. `byteSize` を上限 (例: 圧縮後 5MB) に制限
  5. Storage の Resumable Upload 用署名 URL を発行 (有効期限 5 分)
- 出力: `{ uploadUrl, objectKey }`

### `POST /api/export/pdf`
- 認証: ログイン必須 + ツリー所有確認
- 入力: `{ treeId, paperSize, orientation }`
- 処理: SSR で SVG を生成 → puppeteer/playwright で PDF 化 (オープン事項参照)
- 出力: `application/pdf`

### `POST /api/export/png`
- 同上。`image/png`

### `GET /share/[token]` (実体は Server Component。API ではないがここに併記)
- middleware の認証保護を除外
- Server 内部で `ShareLink` テーブルから token を検索
- 有効なら Service Role クライアントでツリー・人物・関係・写真を取得
- 無効・不在なら `notFound()`

---

## 5. 入出力スキーマの管理
- 各 `features/{domain}/schemas.ts` で zod スキーマを定義
- 主なスキーマ例:
  - `personSchema`, `personDraftSchema`
  - `relationParentChildSchema`, `relationMarriageSchema`
  - `treeSchema`
  - `photoMetaSchema`
- DB の TypeScript 型は `supabase gen types typescript` で生成し `types/database.ts` に配置

---

## 6. プラン上限チェック (共通ロジック)

`lib/plan/limits.ts` に集約。

```ts
// 利用例 (擬似)
async function assertCanAddPerson(userId: string, treeId: string): Promise<void>;
async function assertCanAddPhoto(userId: string, personId: string): Promise<void>;
async function assertCanCreateTree(userId: string): Promise<void>;
```

- 入口は 3 種類 (人物 / 写真 / ツリー)
- 内部では Subscription を読み Plan の上限値と現件数を比較
- 違反時は `ActionError({ code: 'PLAN_LIMIT_EXCEEDED', message })` をスロー (Server Action 側でキャッチして `{ ok: false, error }` に変換)
- 詳細: [billing-design.md](./billing-design.md#plan-limits)

---

## 7. レート制限・乱用対策 (MVP)
- 写真アップロード署名 URL: ユーザー単位で 60 req/min を上限 (Vercel KV or Upstash 等。MVP 範囲外で見送り可。オープン事項)
- Stripe Webhook: Stripe 側がリトライ制御するため独自制限なし
- 共有 URL: トークンが推測困難 (推奨: ULID + secret hash) のため独自レート制限は不要

---

## 8. 監査・ログ
- 主要 Mutation Action は `lib/logger.ts` 経由で `info` ログ (userId, action, targetId)
- Webhook イベントは BillingEvent テーブルに記録
- ログ集約基盤は MVP 未定 (オープン事項)

---

## 9. オープン事項
- O-API1: PDF/PNG エクスポート実装方式 (Vercel Functions 上の puppeteer / Vercel の `@vercel/og` / クライアント `html-to-image` のいずれか)
- O-API2: Webhook 失敗時の再処理運用 (BillingEvent に `processing_status` を持たせるか)
- O-API3: 写真アップロード API のレート制限実装可否 (Upstash Redis 導入要否)
- O-API4: Server Actions のレスポンス時間目標 (NFR-P2 1 秒に対する具体ロジック)
- O-API5: 共有 URL 経由の閲覧アクセスログ取得有無 (個人情報配慮上、最小限に留める方針)
