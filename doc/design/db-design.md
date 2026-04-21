# DB 設計 (Database Design)

## 概要
Supabase (PostgreSQL) 上のスキーマ設計。テーブル定義、リレーション、インデックス、制約、曖昧日付の表現方針、削除カスケード戦略を定義する。

## 対象範囲
DDL レベルのテーブル設計、ER 図、インデックス、制約。RLS ポリシーは [supabase-design.md](./supabase-design.md) を参照。

## 他ドキュメントとの関係
- API 設計: [api-design.md](./api-design.md)
- RLS / Auth / Storage: [supabase-design.md](./supabase-design.md)
- 課金関連テーブル詳細: [billing-design.md](./billing-design.md)

---

## 1. ER 図 (概念)

```
                     ┌─────────────┐
                     │  auth.users │ (Supabase 管理)
                     └──────┬──────┘
                            │ 1
                            ▼
                     ┌─────────────┐         ┌──────────────┐
                     │   profile   │────────▶│ subscription │──┐
                     └──────┬──────┘ 1     1 └──────┬───────┘  │ N
                            │ 1                     │ N         ▼
                            ▼                       ▼     ┌──────────┐
                     ┌─────────────┐         ┌──────────┐ │   plan   │
                     │    tree     │         │ billing_ │ └──────────┘
                     └──┬──┬──┬────┘         │  event   │
                      1 │ 1│  │ 1            └──────────┘
                        │  │  │
                ┌───────┘  │  └────────┐
                ▼          ▼           ▼
         ┌──────────┐ ┌──────────┐ ┌──────────┐
         │  person  │ │  photo   │ │share_link│
         └──┬───────┘ └────┬─────┘ └──────────┘
            │ N         N  │
            ▼              ▼
         ┌──────────────┐  │
         │   relation   │  │
         └──────────────┘  │
                           │
                           ▼ N
                  ┌──────────────────┐
                  │ photo_person_link│ (M:N)
                  └──────────────────┘
```

---

## 2. テーブル定義

### 2.1 `profile`
ユーザープロフィール。`auth.users` の 1:1 拡張。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `user_id` | `uuid` | PK, FK→`auth.users.id` ON DELETE CASCADE | |
| `display_name` | `text` | | 表示名 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | |

- インデックス: PK のみ
- トリガ: `updated_at` 自動更新

---

### 2.2 `plan`
プランマスタ。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `text` | PK | `free` / `basic` / `standard` / `enterprise` |
| `name` | `text` | NOT NULL | 表示名 |
| `monthly_price_jpy` | `integer` | NOT NULL | 内税価格 |
| `max_trees` | `integer` | NOT NULL | -1 で無制限 |
| `max_persons_per_tree` | `integer` | NOT NULL | |
| `max_photos_per_person` | `integer` | NOT NULL | |
| `stripe_price_id` | `text` | UNIQUE NULL 可 | Stripe Price ID |
| `is_active` | `boolean` | NOT NULL DEFAULT true | |
| `created_at` | `timestamptz` | NOT NULL | |

- 初期データ: free / basic / standard / enterprise の 4 行を seed で投入

---

### 2.3 `subscription`
ユーザーごとの現在の契約。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `user_id` | `uuid` | PK, FK→`auth.users.id` ON DELETE CASCADE | 1:1 |
| `plan_id` | `text` | NOT NULL FK→`plan.id` | |
| `status` | `text` | NOT NULL CHECK (active/past_due/canceled/incomplete) | |
| `stripe_customer_id` | `text` | UNIQUE NULL 可 | |
| `stripe_subscription_id` | `text` | UNIQUE NULL 可 | |
| `current_period_end` | `timestamptz` | NULL 可 | |
| `cancel_at_period_end` | `boolean` | NOT NULL DEFAULT false | |
| `downgraded_at` | `timestamptz` | NULL 可 | Free 降格日時 |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |

- インデックス: `stripe_customer_id`, `stripe_subscription_id`
- 初回サインアップ時に `plan_id='free'`, `status='active'` で自動 INSERT (DB トリガまたはアプリ側)

---

### 2.4 `billing_event`
Stripe Webhook 受信ログ。冪等性確保用。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `bigserial` | PK | |
| `stripe_event_id` | `text` | UNIQUE NOT NULL | 冪等性キー |
| `type` | `text` | NOT NULL | イベントタイプ |
| `payload` | `jsonb` | NOT NULL | 受信ペイロード |
| `processed_at` | `timestamptz` | NOT NULL DEFAULT now() | |

- インデックス: UNIQUE (`stripe_event_id`)

---

### 2.5 `tree`
家系図のメタ。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `owner_user_id` | `uuid` | NOT NULL FK→`auth.users.id` ON DELETE CASCADE | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULL | |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |

- インデックス: `owner_user_id` (一覧取得用)

---

### 2.6 `person`
人物。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `tree_id` | `uuid` | NOT NULL FK→`tree.id` ON DELETE CASCADE | |
| `display_name` | `text` | NOT NULL | 必須 |
| `family_name` | `text` | NULL | |
| `given_name` | `text` | NULL | |
| `maiden_name` | `text` | NULL | 旧姓 |
| `gender` | `text` | NULL CHECK (male/female/other/unknown) | |
| `birth_year` | `smallint` | NULL | 曖昧日付対応 |
| `birth_month` | `smallint` | NULL CHECK (1-12) | |
| `birth_day` | `smallint` | NULL CHECK (1-31) | |
| `birth_place` | `text` | NULL | |
| `death_year` | `smallint` | NULL | |
| `death_month` | `smallint` | NULL | |
| `death_day` | `smallint` | NULL | |
| `death_place` | `text` | NULL | |
| `is_alive` | `boolean` | NOT NULL DEFAULT true | 存命フラグ |
| `note` | `text` | NULL | エピソード/経歴 (プレーン or マークダウン) |
| `primary_photo_id` | `uuid` | NULL FK→`photo.id` ON DELETE SET NULL | 代表写真 |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |

- インデックス
  - `tree_id` (ツリー単位の一覧)
  - `(tree_id, birth_year)` (タイムライン用)
- 制約
  - `birth_year IS NULL OR birth_year BETWEEN 1000 AND 9999`
  - 没年が出生年より前にならない CHECK (両方 NOT NULL のときのみ評価)

---

### 2.7 `relation`
人物間の関係。親子と婚姻を 1 テーブルで表現する。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `tree_id` | `uuid` | NOT NULL FK→`tree.id` ON DELETE CASCADE | |
| `kind` | `text` | NOT NULL CHECK (`parent_child` / `marriage`) | |
| `from_person_id` | `uuid` | NOT NULL FK→`person.id` ON DELETE CASCADE | parent_child では親、marriage ではパートナーA |
| `to_person_id` | `uuid` | NOT NULL FK→`person.id` ON DELETE CASCADE | parent_child では子、marriage ではパートナーB |
| `parent_role` | `text` | NULL CHECK (`biological` / `adoptive` / `step`) | parent_child のみ使用 |
| `marriage_type` | `text` | NULL CHECK (`spouse` / `common_law` / `same_sex_partner`) | marriage のみ使用 |
| `marriage_status` | `text` | NULL CHECK (`current` / `divorced` / `widowed`) | marriage のみ使用 |
| `start_year` | `smallint` | NULL | 婚姻開始 (年) |
| `start_month` | `smallint` | NULL | |
| `end_year` | `smallint` | NULL | 婚姻終了 (離婚/死別) |
| `end_month` | `smallint` | NULL | |
| `note` | `text` | NULL | |
| `created_at` | `timestamptz` | NOT NULL | |

- 制約
  - `from_person_id <> to_person_id`
  - `kind = 'parent_child'` のとき `parent_role IS NOT NULL` かつ `marriage_*` は NULL
  - `kind = 'marriage'` のとき `marriage_type IS NOT NULL` かつ `parent_role` は NULL
  - parent_child は `(from_person_id, to_person_id, parent_role)` で UNIQUE
  - marriage は重複防止のため `(LEAST(from,to), GREATEST(from,to), marriage_type)` で UNIQUE (式インデックス)
- インデックス
  - `(tree_id)`
  - `(from_person_id, kind)`, `(to_person_id, kind)`
- 循環参照 (祖先ループ) はアプリ層 (Server Action) で BFS チェック後に INSERT

---

### 2.8 `photo`
写真メタデータ。実体は Supabase Storage。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `tree_id` | `uuid` | NOT NULL FK→`tree.id` ON DELETE CASCADE | |
| `storage_object_key` | `text` | NOT NULL | Storage 内のキー |
| `mime_type` | `text` | NOT NULL CHECK (jpeg/png/webp) | |
| `width` | `integer` | NULL | アップロード後の解像度 |
| `height` | `integer` | NULL | |
| `byte_size` | `integer` | NULL | |
| `taken_year` | `smallint` | NULL | 撮影日 (年) |
| `taken_month` | `smallint` | NULL | |
| `taken_day` | `smallint` | NULL | |
| `caption` | `text` | NULL | |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |

- インデックス
  - `(tree_id)`
  - `(taken_year)` (タイムライン連動用)

---

### 2.9 `photo_person_link`
写真と人物の M:N。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `photo_id` | `uuid` | PK 部, FK→`photo.id` ON DELETE CASCADE | |
| `person_id` | `uuid` | PK 部, FK→`person.id` ON DELETE CASCADE | |
| `created_at` | `timestamptz` | NOT NULL | |

- 主キー: `(photo_id, person_id)`
- インデックス: `(person_id)` (人物→写真検索)

---

### 2.10 `share_link`
共有 URL。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `tree_id` | `uuid` | NOT NULL UNIQUE FK→`tree.id` ON DELETE CASCADE | 1 ツリー 1 リンク |
| `token` | `text` | NOT NULL UNIQUE | 推測困難な文字列 (例: ULID + ランダム接尾) |
| `is_enabled` | `boolean` | NOT NULL DEFAULT true | |
| `created_at` | `timestamptz` | NOT NULL | |
| `revoked_at` | `timestamptz` | NULL | 無効化日時 |

- インデックス: UNIQUE (`token`)

---

### 2.11 `onboarding_state` (任意)
ウィザード進行状態。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `user_id` | `uuid` | PK FK→`auth.users.id` ON DELETE CASCADE | |
| `tree_id` | `uuid` | NULL FK→`tree.id` | 進行中ツリー |
| `current_step` | `text` | NOT NULL | 例: `self`, `parents`, `siblings`, `spouse`, `children`, `done` |
| `is_completed` | `boolean` | NOT NULL DEFAULT false | |
| `updated_at` | `timestamptz` | NOT NULL | |

---

### 2.12 `keepalive_ping`
Supabase Free プランの自動停止 (pause) 回避用。GitHub Actions のスケジュール起動から 2 日に 1 回程度書き込まれる (NFR-A3)。アプリケーションロジックからは参照しない運用専用テーブル。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `bigserial` | PK | |
| `pinged_at` | `timestamptz` | NOT NULL DEFAULT now() | 書き込み時刻 |
| `source` | `text` | NOT NULL DEFAULT 'github-actions' | 書き込み元 (将来 cron-job / vercel-cron 等を区別する余地) |

- インデックス: PK のみ
- レコードは削除せず蓄積する (1 年で約 183 行程度のため肥大化リスクなし)。書き込み履歴自体が「処理が生きていた時間の記録」として運用ログを兼ねる
- RLS: 一般ユーザーからのアクセス禁止 (Service Role からのみ書き込みを許可)

---

## 3. 削除カスケード戦略
- `auth.users` 削除 → `profile`, `subscription`, `tree` (CASCADE)
- `tree` 削除 → `person`, `relation`, `photo`, `share_link`, `photo_person_link` (CASCADE)
- `person` 削除 → `relation` (CASCADE), `photo_person_link` (CASCADE), 写真自体は残す
- `photo` 削除 → DB 行削除と同時にアプリ側で Storage object も削除 (Server Action または DB トリガ + 関数)

---

## 4. 曖昧な日付表現
- `_year` / `_month` / `_day` を分割カラムで保持
- 例: 「1985年だけ判明」→ `birth_year=1985`, `birth_month=NULL`, `birth_day=NULL`
- アプリ側ヘルパー (`lib/date/partial-date.ts`) で表示・比較・タイムライン上のソートを抽象化
- ソート時の優先順は `year ASC, month NULLS LAST, day NULLS LAST`

---

## 5. インデックス戦略まとめ
| テーブル | 主要クエリ | インデックス |
|---|---|---|
| `tree` | ユーザーの一覧表示 | `(owner_user_id)` |
| `person` | ツリー単位の一覧, タイムライン | `(tree_id)`, `(tree_id, birth_year)` |
| `relation` | 人物の家族関係取得 | `(tree_id)`, `(from_person_id, kind)`, `(to_person_id, kind)` |
| `photo` | ツリー写真一覧, タイムライン | `(tree_id)`, `(taken_year)` |
| `photo_person_link` | 人物→写真 / 写真→人物 | PK + `(person_id)` |
| `share_link` | トークン検索 | UNIQUE `(token)` |
| `subscription` | Stripe ID 検索 | `(stripe_customer_id)`, `(stripe_subscription_id)` |
| `billing_event` | 重複排除 | UNIQUE `(stripe_event_id)` |
| `keepalive_ping` | キープアライブ書き込みのみ (削除なし) | PK のみ (件数が少ないため) |

---

## 6. マイグレーション運用
- Supabase CLI のマイグレーションファイルを `supabase/migrations/` に置く
- 1 マイグレーション = 1 トピック
- seed (`plan` の初期データ) は `supabase/seed.sql`
- Beads タスク完了時にマイグレーションファイルを add するルール

---

## 7. データ整合性 (アプリ層補助)
- 親子の循環参照: Server Action で BFS チェック (FR-P5)
- 自分との関係: DB CHECK で防御
- 重複婚姻: 式インデックスで重複防止
- 親が複数 (実親 2 + 養親 N) は許容 (parent_role の組み合わせで一意)

---

## 8. オープン事項
- O-DB1: `note` (エピソード) のフォーマット (Markdown / リッチテキスト / プレーン)。MVP はプレーンを推奨
- O-DB2: `photo` 削除時の Storage 削除手段 (DB トリガ vs Edge Function vs アプリ側)
- O-DB3: 大量人物時のページング戦略 (現状はツリー全件取得想定)
- O-DB4: Soft delete の採否 (現状は物理削除)。家族写真のため誤削除リカバリ需要は将来検討
- O-DB5: 作成者メタ (`tree.created_by_display_name` 等) を `tree` に冗長保持するか
- O-DB6: 履歴ログ (誰がいつ編集したか) の保持有無
