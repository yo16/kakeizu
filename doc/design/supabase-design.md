# Supabase 設計 (Auth / RLS / Storage)

## 概要
Supabase を Auth / DB / Storage として利用するための設定方針。RLS ポリシー、Auth プロバイダ設定、Storage バケット構成、画像変換戦略を定義する。

## 対象範囲
Supabase Auth (メール+PW / Google OAuth) / RLS ポリシー / Storage バケットと署名 URL / Image Transformation。

## 他ドキュメントとの関係
- DB 設計: [db-design.md](./db-design.md)
- API 設計: [api-design.md](./api-design.md)
- アプリ構成 (Cookie/middleware): [app-architecture.md](./app-architecture.md)
- セキュリティ: [security-design.md](./security-design.md)

---

## 1. クライアント構成

### Supabase クライアントの 3 系統 (`@supabase/ssr`)
- `lib/supabase/server.ts` — Server Components / Server Actions / Route Handlers 用 (`createServerClient`)。`import 'server-only'` を必須化
- `lib/supabase/client.ts` — ブラウザ用 (`createBrowserClient`)
- `lib/supabase/middleware.ts` — middleware.ts 専用 (Cookie の自動更新)

### Service Role クライアント
- `lib/supabase/server.ts` 内に `createServiceRoleClient()` を別関数として定義
- 用途を以下に限定:
  - 共有 URL (`/share/[token]`) のデータ取得
  - Stripe Webhook 処理時の Subscription 更新
  - PDF/PNG エクスポート時のサーバー側データ取得
- 通常のユーザー操作では使用しない (RLS バイパスを最小化)

---

## 2. Auth 設定

### プロバイダ
- メール+パスワード (Supabase Auth 標準)
- Google OAuth

### 設定値 (Supabase Dashboard)
| 項目 | 設定 |
|---|---|
| Email confirmation | ON (登録時メール確認必須) |
| Password min length | 8 文字以上 |
| OAuth Redirect URLs | `https://{domain}/auth/callback` |
| Site URL | `https://{domain}` |
| Email templates | 日本語版に上書き |
| JWT expiry | デフォルト (1h) |
| Refresh token rotation | ON |

### サインアップ時のフック
- Supabase Auth の Database Webhook または DB トリガで以下を自動実行:
  1. `profile` 行を作成 (`display_name = email から派生`)
  2. `subscription` 行を `plan_id='free', status='active'` で作成
- 推奨: PostgreSQL トリガ (`ON INSERT to auth.users`)。Edge Function 経由は MVP では避ける

### OAuth コールバック
- `/auth/callback` Route Handler で `supabase.auth.exchangeCodeForSession(code)` を実行
- 成功後 `/dashboard` (オンボーディング未完了なら `/onboarding`) へリダイレクト

### セッション管理
- Cookie ベース (`@supabase/ssr` が `sb-{ref}-auth-token` を発行)
- middleware.ts で毎回リフレッシュ (`getUser()` 呼び出しで Cookie 更新)
- Edge Runtime 制約: 重い検証は避ける。本格的な認可チェックは `(main)/layout.tsx` 側で実施

### アカウント削除
- アプリ側 `deleteAccount` Server Action から Service Role で `auth.admin.deleteUser(id)` を呼ぶ
- CASCADE で関連データ全削除
- Stripe Subscription があればキャンセル API も呼ぶ

---

## 3. RLS (Row Level Security) ポリシー

### 基本方針
- すべての公開スキーマ (`public.*`) で RLS を有効化
- ポリシーはテーブル単位で `select` / `insert` / `update` / `delete` を分けて定義
- 共有 URL 経由の閲覧は **Service Role 経由でのみ許可** (RLS をバイパス)。RLS には共有用ポリシーを書かず、シンプルに保つ
- プラン上限チェックは RLS では行わず **アプリ層 (Server Action) で実施**

### `profile`
| 操作 | ポリシー |
|---|---|
| SELECT | `auth.uid() = user_id` |
| INSERT | `auth.uid() = user_id` (基本トリガ経由) |
| UPDATE | `auth.uid() = user_id` |
| DELETE | 不可 (アカウント削除経由のみ) |

### `subscription`
| 操作 | ポリシー |
|---|---|
| SELECT | `auth.uid() = user_id` |
| INSERT/UPDATE/DELETE | 不可 (Service Role 経由のみ) |

### `plan`
- SELECT: 全ユーザー (認証問わず) — 料金ページ表示用
- INSERT/UPDATE/DELETE: 不可 (管理者は SQL 直接編集)

### `billing_event`
- SELECT: 不可 (Service Role のみ)
- INSERT: Service Role のみ
- ※ ユーザー向け請求履歴は Stripe Customer Portal で表示

### `tree`
| 操作 | ポリシー |
|---|---|
| SELECT | `auth.uid() = owner_user_id` |
| INSERT | `auth.uid() = owner_user_id` |
| UPDATE | `auth.uid() = owner_user_id` |
| DELETE | `auth.uid() = owner_user_id` |

### `person`
| 操作 | ポリシー |
|---|---|
| ALL | `EXISTS (SELECT 1 FROM tree WHERE tree.id = person.tree_id AND tree.owner_user_id = auth.uid())` |

- パフォーマンス対策として `tree_id` にインデックスがあることを前提

### `relation`
- `person` と同じ方針 (`tree_id` 経由でチェック)

### `photo`
- `person` と同じ方針

### `photo_person_link`
- `EXISTS (SELECT 1 FROM photo p JOIN tree t ON p.tree_id = t.id WHERE p.id = photo_person_link.photo_id AND t.owner_user_id = auth.uid())`

### `share_link`
| 操作 | ポリシー |
|---|---|
| SELECT/INSERT/UPDATE/DELETE | tree のオーナーのみ |
| ※ 共有 URL の検証は Service Role 経由 | (RLS には書かない) |

### `onboarding_state`
- `auth.uid() = user_id`

### `keepalive_ping`
| 操作 | ポリシー |
|---|---|
| SELECT/INSERT/UPDATE/DELETE | 一般ユーザーは全拒否 (ポリシーを定義しない or `USING (false)`) |
| ※ GitHub Actions からの書き込みは Service Role でアクセスするため RLS はバイパスされる。INSERT のみ行い、DELETE 運用は無し | |

---

## 4. Storage 設計

### バケット構成
| バケット | 公開設定 | 用途 |
|---|---|---|
| `photos` | Private | 人物写真本体 |

### オブジェクトキーの命名規則
```
photos/{ownerUserId}/{treeId}/{photoId}.{ext}
```

- `ownerUserId` プレフィックスを付けることで RLS とパス検証を一致させる
- `photoId` は DB の `photo.id` (UUID)
- ファイル拡張子は元の MIME に対応 (`.jpg` / `.png` / `.webp`)

### Storage RLS (Storage の RLS は `storage.objects` テーブルに対する SQL ポリシー)
- SELECT: パスから `ownerUserId` を抽出し `auth.uid()` と一致 OR Service Role 経由
- INSERT/UPDATE/DELETE: パスの `ownerUserId` が `auth.uid()` と一致
- 共有 URL 経由の表示は Service Role でアクセスできる「変換 URL」を Server で発行 (公開バケットにはしない)

### アップロードフロー
1. クライアントで圧縮 (FR-M6: 長辺 2048px / JPEG 品質 85% を推奨初期値)
2. クライアントが `POST /api/storage/signed-upload` を呼ぶ
3. サーバー側で:
   - ツリー所有確認
   - プラン上限 (写真枚数) チェック
   - MIME 型・サイズ上限の検証
   - `objectKey` を生成し、Storage の **Resumable Upload 用署名 URL** を発行
4. クライアントが署名 URL に PUT/POST で直接アップロード
5. アップロード成功後、クライアントが `registerPhotoAfterUpload` Server Action を呼ぶ → DB に `photo` 行を作成
6. 失敗時 (5 が呼ばれない場合) のオーファン: 定期バッチで Storage と DB の差分を検出 (オープン事項)

### 上限値
- 1 ファイルあたり最大 5 MB (圧縮後)
- 受け入れ MIME: `image/jpeg`, `image/png`, `image/webp`
- 拒否時は `400` を返す

### Image Transformation
- `supabase.storage.from('photos').createSignedUrl(key, expiresIn, { transform: { width, height, resize: 'cover' } })`
- 用途別サイズ:
  | 用途 | width | height | resize |
  |---|---|---|---|
  | サムネイル (ツリーノード) | 96 | 96 | cover |
  | 詳細パネル | 480 | 480 | contain |
  | フルビュー | 1280 | 1280 | contain |
- 署名 URL の有効期限は 1 時間。クライアントでキャッシュし、期限切れ時に再発行
- 配信は `next/image` の `loader` カスタマイズで対応

---

## 5. リアルタイム
- MVP では使用しない (楽観的 UI + revalidatePath)
- 将来共同編集を導入する場合に Supabase Realtime を検討

---

## 6. バックアップ・運用
- Supabase 標準の Daily Backup (Free→Pro 移行で取得期間延長)
- 重要操作 (アカウント削除等) のロールバック手順は Supabase Console から PITR で対応
- マイグレーション失敗時のロールバック手順は `supabase/migrations/README.md` で運用ルール化 (将来追加)

---

## 7. オープン事項
- O-S1: Storage オーファン対策 (アップロードしたが DB 登録されなかったオブジェクト) の定期掃除手段
- O-S2: Image Transformation API のレート制限 (Supabase Free プランは月次制限あり) と Pro 移行タイミング
- O-S3: メール確認 ON のままでオンボーディング体験を損なわないか (確認前に閲覧不可とするか / 後で確認させるか)
- O-S4: Google OAuth で取得した avatar URL を `profile.display_name` 周りに自動セットするか
- O-S5: アカウント削除時に Stripe Subscription をキャンセルするタイミング (即時 vs 期間終了時)
- O-S6: Storage バケットの公開化 (CDN 経由の高速配信) を検討するか。MVP は Private + 署名 URL を採用
