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

---

## 本番 Supabase Dashboard 設定手順

`supabase/config.toml` はローカル開発環境専用です。本番環境では Supabase Dashboard で同等の設定を行う必要があります。

### 1. Email confirmation ON

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. 対象プロジェクトを選択
3. 左メニュー「Authentication」→「Providers」→「Email」を開く
4. 「Confirm email」を ON にする
5. 「Save」をクリック

### 2. パスワード最低文字数の設定

1. 左メニュー「Authentication」→「Policies」→「Password Settings」を開く
2. 「Minimum password length」を `8` に設定
3. 「Save」をクリック

### 3. Google OAuth プロバイダの有効化

#### Google Cloud Console での準備

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアント ID」を選択
4. アプリケーションの種類: 「ウェブアプリケーション」
5. 承認済みのリダイレクト URI に以下を追加:
   - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
6. 作成後、「クライアント ID」と「クライアントシークレット」をコピー

#### Supabase Dashboard での設定

1. 左メニュー「Authentication」→「Providers」→「Google」を開く
2. 「Google enabled」を ON にする
3. 「Client ID (for OAuth)」に Google Cloud Console で取得した Client ID を入力
4. 「Client Secret (for OAuth)」に Client Secret を入力
5. 「Save」をクリック

### 4. Redirect URL の追加

1. 左メニュー「Authentication」→「URL Configuration」を開く
2. 「Site URL」に本番ドメインを設定（例: `https://your-domain.com`）
3. 「Redirect URLs」に以下を追加:
   - `https://your-domain.com/auth/callback`
   - （必要に応じてプレビュー環境の URL も追加）
4. 「Save」をクリック
