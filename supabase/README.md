# Supabase ローカル開発環境

## 前提条件

- **Docker Desktop** が起動していること（必須）
- Node.js 18 以上

---

## Supabase CLI インストール

以下のいずれかの方法でインストールしてください。

### npm (npx 経由で都度実行する場合はインストール不要)

```bash
npm install -g supabase
```

### Homebrew (macOS / Linux)

```bash
brew install supabase/tap/supabase
```

### Scoop (Windows)

```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

---

## 初期化

プロジェクトルートで以下を実行します（初回のみ）。

```bash
npx supabase init
```

`supabase/config.toml` が生成されます。本リポジトリにはすでに含まれているため、通常は実行不要です。

---

## ローカル DB / Auth / Storage の起動

Docker Desktop が起動していることを確認してから実行してください。

```bash
npx supabase start
```

起動後、以下のような接続情報が表示されます。

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
Inbucket URL: http://127.0.0.1:54324
JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
anon key: eyJ...
service_role key: eyJ...
```

---

## `.env.local` への反映

プロジェクトルートの `.env.local` に以下を設定してください（`.env.local.example` をコピーして編集）。

```bash
cp .env.local.example .env.local
```

`supabase start` で取得した値を `.env.local` に反映します。

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key の値>
SUPABASE_SERVICE_ROLE_KEY=<service_role key の値>
```

---

## 主要コマンド一覧

| コマンド | 説明 |
|---|---|
| `npx supabase start` | ローカル環境を起動 |
| `npx supabase stop` | ローカル環境を停止 |
| `npx supabase status` | 接続情報の確認 (anon key 等) |
| `npx supabase db reset` | DB をリセットしてマイグレーションを再適用 |
| `npx supabase migration new <name>` | 新規マイグレーションファイルを作成 |
| `npx supabase db push` | マイグレーションをリモートに適用 |
| `npx supabase db pull` | リモートのスキーマ変更をローカルに反映 |
| `npx supabase gen types typescript --local` | TypeScript 型を自動生成 |

---

## マイグレーション

マイグレーションファイルは `supabase/migrations/` に配置されます。

### 新規マイグレーション作成

```bash
npx supabase migration new <説明>
```

例:

```bash
npx supabase migration new create_profiles_table
```

`supabase/migrations/{timestamp}_create_profiles_table.sql` が生成されます。

### ローカルへの適用

```bash
npx supabase db reset
```

### リモート (本番) への適用

```bash
npx supabase db push
```

---

## Supabase Studio

ローカル起動後、以下の URL で Supabase Studio (管理UI) にアクセスできます。

```
http://127.0.0.1:54323
```

---

## メール確認 (Inbucket)

ローカル環境では、送信されるメールは Inbucket で確認できます。

```
http://127.0.0.1:54324
```
