# スタイリング設計 (Styling Design)

## 概要
CSS Modules + CSS Custom Properties を用いたデザインシステム。カラー、タイポグラフィ、スペーシング、エレベーション、コンポーネントスタイル方針を定義する。

## 対象範囲
グローバル CSS / トークン (CSS Custom Properties) / コンポーネントスタイル / レスポンシブ / ダークモード方針。

## 他ドキュメントとの関係
- フロントエンド構成: [frontend-design.md](./frontend-design.md)
- アプリ構成: [app-architecture.md](./app-architecture.md)

---

## 1. 基本方針 (NFR-D1, NFR-D2)
- **Tailwind CSS 禁止**。すべて CSS Modules + CSS Custom Properties で実装する
- ユーティリティクラスでなく、コンポーネント単位でセマンティックなクラス名を付ける
- デザイントーンは「家族向け」「温かみ」「柔らかさ」を重視 (NFR-D2)
- アクセシビリティに配慮 (コントラスト比 4.5:1 以上 / フォーカスリング明示)

---

## 2. ファイル構成

```
src/styles/
├── reset.css         # ブラウザ初期スタイル正規化
├── tokens.css        # CSS Custom Properties (カラー / スペース / タイポ)
├── globals.css       # body / a / 共通アニメーション
└── fonts.css         # フォント宣言

各コンポーネント:
features/tree/components/TreeCanvas/
├── TreeCanvas.tsx
└── TreeCanvas.module.css
```

- `app/layout.tsx` で `reset.css` → `tokens.css` → `globals.css` の順で import
- 各 React コンポーネントは隣接の `.module.css` を import

---

## 3. デザイントークン (`tokens.css`)

### カラー
家族・温かみを軸に、ベージュ + ソフトグリーン + ダスティローズ系のパレットを採用。

```css
:root {
  /* Brand */
  --color-brand-50:  #fdf6ed;
  --color-brand-100: #f7e6cc;
  --color-brand-300: #e3b87a;
  --color-brand-500: #c98b3f;   /* primary */
  --color-brand-700: #8a5a23;

  /* Accent (relations / highlights) */
  --color-accent-300: #a4c8a3;
  --color-accent-500: #6da16d;
  --color-accent-700: #3f6d40;

  /* Neutral */
  --color-bg:        #fffaf3;
  --color-surface:   #ffffff;
  --color-surface-2: #f5efe5;
  --color-border:    #e3dccc;
  --color-text:      #2a2620;
  --color-text-muted:#6e655a;

  /* Semantic */
  --color-success:   #3f8a4f;
  --color-warning:   #c9881f;
  --color-danger:    #b34a3f;
  --color-info:      #4a7fb3;

  /* Relation line colors (ツリー描画で使用) */
  --color-relation-biological: #6da16d;
  --color-relation-adoptive:   #c98b3f;
  --color-relation-step:       #b78bcd;
  --color-relation-marriage-current: #c95a78;
  --color-relation-marriage-divorced: #a99c92;
  --color-relation-marriage-widowed:  #8a8a8a;
}
```

### タイポグラフィ
- 日本語: `"Noto Sans JP"`, `"Hiragino Kaku Gothic ProN"`, sans-serif
- 数字・英字: `"Inter"`, sans-serif
- 見出しに装飾用として `"Noto Serif JP"` を限定使用

```css
:root {
  --font-sans: "Inter", "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif;
  --font-serif: "Noto Serif JP", serif;

  --font-size-xs:  0.75rem;
  --font-size-sm:  0.875rem;
  --font-size-md:  1rem;
  --font-size-lg:  1.125rem;
  --font-size-xl:  1.375rem;
  --font-size-2xl: 1.75rem;
  --font-size-3xl: 2.25rem;

  --line-height-tight: 1.25;
  --line-height-base:  1.6;
  --line-height-relaxed: 1.75;

  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semibold:600;
  --font-weight-bold:    700;
}
```

### スペーシング (4px ベース)
```css
:root {
  --space-1: 0.25rem;  /* 4px  */
  --space-2: 0.5rem;   /* 8px  */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.5rem;   /* 24px */
  --space-6: 2rem;     /* 32px */
  --space-8: 3rem;     /* 48px */
  --space-10:4rem;     /* 64px */
}
```

### Radius / Elevation
```css
:root {
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 2px rgba(40, 30, 15, 0.06);
  --shadow-md: 0 4px 12px rgba(40, 30, 15, 0.08);
  --shadow-lg: 0 8px 24px rgba(40, 30, 15, 0.12);
  --shadow-focus: 0 0 0 3px rgba(201, 139, 63, 0.35);
}
```

### Z-index
```css
:root {
  --z-base: 0;
  --z-toolbar: 10;
  --z-detail-panel: 20;
  --z-modal: 100;
  --z-toast: 200;
  --z-tooltip: 300;
}
```

### ブレークポイント (CSS の Media Query 直書きで使用)
- `sm`: `@media (max-width: 600px)`
- `md`: `@media (max-width: 960px)`
- `lg`: `@media (min-width: 961px)`

CSS Custom Properties はメディアクエリ内では使えるが、しきい値そのものは使えないため、定数として SCSS-like ではなく定型コメントで管理する。

---

## 4. グローバルスタイル (`globals.css`)
- `body` の背景・テキスト色をトークンから設定
- リンクカラー、フォーカスリング (`outline: var(--shadow-focus)`)
- スクロールバー、選択色 (`::selection`) の調整
- アニメーションの prefers-reduced-motion 対応

---

## 5. コンポーネントスタイルの規約
- ファイル名: `Component.module.css`
- クラス名: lowerCamelCase (`primaryButton`, `nodeCard`)
- ネスト禁止 (PostCSS のネスト機能は使わない)。BEM 風に `&__element` も使わずフラットに
- `:global(...)` の使用は最小限
- 各コンポーネントの局所的トークンが必要なら、コンポーネント上部で `--local-*` を定義し再利用
- メディアクエリはスタイル末尾にまとめる

例:
```css
/* TreeCanvas.module.css */
.canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg);
}

.node {
  --node-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--node-radius);
  box-shadow: var(--shadow-sm);
}

.node:hover {
  box-shadow: var(--shadow-md);
}

@media (max-width: 600px) {
  .node {
    padding: var(--space-2) var(--space-3);
  }
}
```

---

## 6. ボタン / フォームの基本スタイル指針

### ボタン
- バリエーション: `primary`, `secondary`, `ghost`, `danger`, `link`
- サイズ: `sm`, `md`, `lg`
- 状態: hover / active / focus-visible / disabled / loading
- 角丸 `--radius-md`、フォントウェイト `--font-weight-medium`

### 入力
- 高さ: 40px (sm) / 44px (md) / 48px (lg)
- 枠線: `--color-border` → focus 時に `--color-brand-500` + `--shadow-focus`
- エラー時: `--color-danger` + メッセージは赤系小フォント

### モーダル
- オーバーレイ: `rgba(40, 30, 15, 0.45)` + backdrop-filter: blur(2px)
- 角丸 `--radius-lg`、最大幅 `min(560px, 90vw)`

---

## 7. アニメーション指針
- 主要アニメーション: 150〜300ms / `cubic-bezier(0.2, 0.8, 0.2, 1)`
- ノード追加時にフェードイン + 軽いスケール
- DetailPanel の開閉はスライドイン (right→left)
- prefers-reduced-motion: アニメーション無効化

---

## 8. ダークモード方針
- MVP では非対応 (オープン事項)
- 将来対応するため、トークンは `:root` と `[data-theme="dark"]` の二段構成にできるよう命名のみ揃える

---

## 9. アイコン
- `lucide-react` を採用 (軽量・カスタマイズ容易)
- サイズ: 16 / 20 / 24 px
- 色は `currentColor` 継承

---

## 10. オープン事項
- O-ST1: ダークモード対応の有無 (MVP では見送り、将来検討)
- O-ST2: フォントの読み込み方式 (next/font 経由 vs 自前)
- O-ST3: アイコンライブラリの正式選定 (lucide-react を仮採用)
- O-ST4: アクセントカラー (婚姻線などの彩度) の最終調整は実機確認後
- O-ST5: 印刷 (PDF エクスポート) 用スタイルの分離方針
