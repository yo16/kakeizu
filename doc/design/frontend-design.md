# フロントエンド設計 (Frontend Design)

## 概要
画面構成、コンポーネント設計、ページ遷移、UI インタラクション (近接ボタン、ウィザード、関係付け、タイムライン操作) を定義する。

## 対象範囲
ページ・コンポーネント階層、UI フロー、フォーム、ツリーキャンバスのインタラクション。スタイリング詳細は [styling-design.md](./styling-design.md)、ツリー描画アルゴリズムは [tree-visualization-design.md](./tree-visualization-design.md)。

## 他ドキュメントとの関係
- アプリ構成: [app-architecture.md](./app-architecture.md)
- ツリー描画: [tree-visualization-design.md](./tree-visualization-design.md)
- スタイリング: [styling-design.md](./styling-design.md)
- 課金 UI: [billing-design.md](./billing-design.md)

---

## 1. 主要画面一覧

| 画面 | パス | 概要 |
|---|---|---|
| ランディング | `/` | サービス紹介、CTA |
| 料金 | `/pricing` | プラン比較表、Checkout 起点 |
| サインイン | `/login` | メール+PW + Google OAuth |
| サインアップ | `/signup` | 同上 |
| パスワードリセット | `/forgot-password` | |
| ダッシュボード | `/dashboard` | 自分のツリー一覧、新規作成導線 |
| オンボーディング | `/onboarding` | ウィザード形式の初回登録 (FR-V6) |
| ツリー編集 | `/trees/[treeId]` | メインの編集画面 |
| ツリー設定 | `/trees/[treeId]/settings` | タイトル・説明・削除 |
| 共有管理 | `/trees/[treeId]/share` | 共有 URL の発行・無効化 |
| エクスポート | `/trees/[treeId]/export` | PDF/PNG 出力設定 |
| 共有閲覧 | `/share/[token]` | 公開ビュー (閲覧専用) |
| アカウント | `/account` | プロフィール・削除 |
| 課金 | `/account/billing` | 現プラン・変更・解約 |

---

## 2. コンポーネント階層

### 共有コンポーネント (`components/`)

#### `components/ui/` — 汎用 UI
- `Button`, `IconButton`, `LinkButton`
- `TextInput`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`
- `Modal`, `Drawer`, `Tooltip`, `Popover`
- `Card`, `Badge`, `Tag`
- `Avatar`, `Spinner`, `Skeleton`
- `Toast` / `ToastProvider`
- `Form`, `FormField`, `FormErrorMessage` (react-hook-form ラッパ)
- `EmptyState`, `ErrorState`

#### `components/layout/`
- `AppHeader` (ロゴ・ユーザーメニュー)
- `AppFooter`
- `MainShell` (`(main)` 配下のレイアウト)
- `AuthShell` (`(auth)` 配下のレイアウト)
- `ShareShell` (`/share/[token]` 用 — 限定的な機能のみ表示)

#### `components/feedback/`
- `ConfirmDialog`
- `PlanLimitDialog` (上限到達時の専用)
- `UpgradeBanner`

---

### 機能別コンポーネント (`features/`)

#### `features/auth/components/`
- `LoginForm`, `SignupForm`, `ForgotPasswordForm`
- `GoogleSignInButton`
- `EmailVerificationNotice`

#### `features/tree/components/`
- `TreeListCard` (ダッシュボードのカード)
- `TreeCreateForm`
- `TreeSettingsForm`
- `TreeEditorShell` (Client) — Zustand Provider + 全体レイアウト
- `TreeCanvas` (Client) — SVG 描画 (詳細は tree-visualization-design)
- `TreeToolbar` (ズーム・タイムライン・ヘルプ)
- `NodeQuickActions` (近接ボタン: +親 / +子 / +配偶者)
- `DetailPanel` (右ドロワー / 下シート)
- `RelationDialog` (既存人物同士の関係付け)

#### `features/person/components/`
- `PersonCard` (詳細パネル内)
- `PersonForm` (新規作成・編集の共通フォーム)
- `PartialDateInput` (年/月/日 別個入力)
- `PhotoGallery` (写真一覧 + 代表写真選択)
- `EpisodeEditor` (エピソード編集)

#### `features/photo/components/`
- `PhotoUploader` (ドラッグ&ドロップ + 圧縮)
- `PhotoMetaForm` (撮影日・キャプション・関連人物)
- `PhotoLightbox` (拡大表示)

#### `features/relation/components/`
- `RelationKindPicker`
- `RelationDateRangeInput`
- `RelationStatusPicker` (current/divorced/widowed)

#### `features/timeline/components/`
- `TimelineBar` (横長スクロール式)
- `TimelineCursor`
- `YearSelector`

#### `features/share/components/`
- `ShareUrlPanel` (URL 表示・コピー・再発行・無効化)
- `ShareConfirmDialog`

#### `features/onboarding/components/`
- `OnboardingWizard` (ステップ進行コンテナ)
- `WizardStepSelf`, `WizardStepParents`, `WizardStepSiblings`, `WizardStepSpouse`, `WizardStepChildren`
- `WizardSkipButton`

#### `features/billing/components/`
- `PlanComparisonTable`
- `CurrentPlanCard`
- `UpgradeButton`
- `BillingPortalLink`
- `OverLimitBanner` (プラン降格後の超過状態通知)

#### `features/export/components/`
- `ExportOptionsForm`
- `ExportPreview`

---

## 3. ツリー編集画面の構造

### レイアウト
```
┌──────────────────────────────────────────┐
│ AppHeader                                │
├──────────────────────────────────────────┤
│ TreeToolbar                              │
├──────────────────────────────────────────┤
│                                  ┌──────┐│
│                                  │      ││
│        TreeCanvas (SVG)          │Detail││
│   (ノード・エッジ・近接ボタン)   │Panel ││
│                                  │      ││
│                                  └──────┘│
├──────────────────────────────────────────┤
│ TimelineBar                              │
└──────────────────────────────────────────┘
```

- DetailPanel は右ドロワー (PC) / 下シート (タブレット縦)
- タイムライン下部はツリー全体に対する年スライダー

### Zustand store (`treeEditorStore`)
```ts
interface TreeEditorState {
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  detailPanelOpen: boolean;
  currentYear: number | null; // タイムライン
  isUploading: boolean;
  // actions
  selectPerson(id: string | null): void;
  setCurrentYear(y: number | null): void;
  ...
}
```

### 近接ボタン (FR-V5)
- ノードホバー時 (PC) / タップ後の長押し or アイコンタップ (タブレット) で表示
- ボタン 3 種:
  - `+ 親` — 既存に親が 0〜1 名なら追加可、複数親 (最大 2 ペア) を許可
  - `+ 子` — 配偶者ペアを選択させるサブメニューを出す (複数配偶者がいる場合)
  - `+ 配偶者` — 婚姻関係追加
- クリック → `PersonForm` をモーダルで開く → submit で `quickAddRelative` Server Action 呼び出し

### ウィザードフロー (FR-V6)
1. **Self**: 自分自身の基本情報入力 (氏名・生年・性別・写真任意)
2. **Parents**: 父母を任意入力 (両方スキップ可)
3. **Siblings**: 兄弟姉妹を 0〜N 名入力
4. **Spouse**: 配偶者を任意入力
5. **Children**: 子を 0〜N 名入力
6. **Done**: ツリー編集画面へ遷移

- 各ステップ右上にスキップボタン
- 中断時は `onboarding_state` に保存し、再開可能
- ステップごとに submit → DB へ即保存 (途中離脱でもデータが残る)

### 既存人物の関係付け (FR-V7)
- ツールバーの「関係を追加」ボタン → `RelationDialog` 起動
- ステップ:
  1. 関係種別選択 (親子 / 婚姻)
  2. 1 人目を選択 (リスト or ツリー上クリック)
  3. 2 人目を選択
  4. 詳細項目 (parent_role / marriage_type / dates) 入力
  5. 確認 → submit
- 矛盾時はエラーメッセージ表示

---

## 4. 詳細パネル (DetailPanel)
- タブ構成: 「基本情報」「写真」「関係」「エピソード」
- 写真タブでは `PhotoGallery` を表示。代表写真の星アイコンで切替
- タイムライン年が選択されている場合、顔写真は `lib/photo/select-by-year.ts` で時系列最近傍を表示 (FR-TL2)
- 編集アイコン → 各セクションをインライン編集または `PersonForm` モーダル

---

## 5. タイムライン (FR-TL1, FR-TL2)
- 横スクロール可能な年軸
- 表示要素:
  - 各人物の生没期間バー (色分け)
  - イベントマーカー (生誕 / 婚姻 / 没)
- ドラッグ or クリックで年を選択 → `currentYear` を更新 → DetailPanel と連動
- 年範囲は登録人物の min/max から自動算出
- 写真の撮影日マーカーも軽くオーバーレイ表示 (FR-TL2 補助)

---

## 6. 共有閲覧画面 (`/share/[token]`)
- 機能制限:
  - 編集不可 (近接ボタン非表示)
  - エクスポート不可
  - 詳細パネルは閲覧のみ
  - タイムライン操作は許可
- ヘッダーは `ShareShell` 専用 (作成者名 + サービスリンク)
- 「自分の家系図を作る」CTA を末尾に配置

---

## 7. プラン上限到達 UI (FR-B3, FR-B10)
- Server Action のレスポンスが `PLAN_LIMIT_EXCEEDED` の場合、`PlanLimitDialog` を表示
- 内容: 現プラン名 / 上限値 / アップグレード CTA / 詳細リンク
- 降格状態 (現件数 > 新プラン上限) のときは画面上部に `OverLimitBanner` を常時表示

---

## 8. レスポンシブ
- ブレークポイント:
  - `sm`: 〜600px (タブレット縦)
  - `md`: 600〜960px (タブレット横)
  - `lg`: 960px〜 (PC)
- ツリーキャンバスは `lg` を主想定。`sm`/`md` ではタイムラインを折り畳み、DetailPanel を下シート化
- スマホ専用 UI は MVP 非対応 (将来検討)

---

## 9. アクセシビリティ
- フォーカスリングは CSS で明示
- モーダルはフォーカストラップ + Esc で閉じる
- ノードボタンは aria-label で「{氏名} のメニュー」等を提供
- 画像には alt (代表写真は氏名)

---

## 10. ローディング・エラー UI
- ページ単位で `loading.tsx` + `Skeleton`
- フォーム送信中はボタン disabled + spinner
- ネットワーク失敗時は `Toast` で通知 + 再試行リンク

---

## 11. オープン事項
- O-FE1: ツリーキャンバスの描画ライブラリ (SVG 自前 / react-flow / dagre) — tree-visualization-design 側で確定
- O-FE2: タイムライン UI ライブラリ (vis-timeline / 自前) の選定
- O-FE3: タブレット縦時の DetailPanel 形式 (下シート展開率の挙動)
- O-FE4: ウィザードのスキップ後再開 UI (ダッシュボードに「ウィザードを再開」リンクを置くか)
- O-FE5: 写真ギャラリーの並び替え UI (撮影日順 / アップロード順)
- O-FE6: 編集系操作の autosave 採否 (現状は明示保存)
