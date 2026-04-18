# 家系図ツリー描画設計 (Tree Visualization Design)

## 概要
縦型家系図のレイアウト・描画アルゴリズム、特殊ケース表現、ズーム・パン、タイムライン連動の写真自動切替の設計を定義する。

## 対象範囲
ノード/エッジ表現、レイアウト計算方針、描画技術選定、操作インタラクション、タイムライン連動ロジック。

## 他ドキュメントとの関係
- フロントエンド (UI): [frontend-design.md](./frontend-design.md)
- DB (relation の構造): [db-design.md](./db-design.md)
- スタイリング (色トークン): [styling-design.md](./styling-design.md)

---

## 1. 表示モデルと特殊ケース

### 表現対象 (FR-V1, FR-V4)
- 縦型ツリー (上から下に世代が進む)
- 表示要素:
  - **PersonNode**: 1 人を 1 ノード
  - **MarriageEdge**: 配偶者ペアを横線で接続 (婚姻ノードを介する)
  - **ParentChildEdge**: 婚姻ノード (or 単独親ノード) から子ノードへ縦線

### 特殊ケースの視覚的表現
| ケース | 表現方法 |
|---|---|
| 複数配偶者 | 1 人のノードから左右に複数の MarriageEdge を伸ばし、それぞれ婚姻ノード経由で子を分岐 |
| 再婚 | 婚姻ノードに `divorced/widowed` ステータスを線種 (破線) で表示 |
| 養子 | 親子線を `--color-relation-adoptive` (オレンジ系) + 点線 |
| 連れ子 | `--color-relation-step` (紫系) + 細線 |
| 同性パートナー | 婚姻ノードのアイコンを変える (`marriage_type=same_sex_partner`) |
| 事実婚 | 婚姻ノードを破線枠で表現 |
| 子なし・未婚 | ノードのみ表示、配偶者・子線なし |
| 不明な親 | 「不明」のプレースホルダノードを表示 (ユーザーが明示的に作る場合のみ) |

### 線種・色のまとめ
- 親子・実親: `--color-relation-biological` 実線
- 親子・養親: `--color-relation-adoptive` 点線
- 親子・連れ子: `--color-relation-step` 細線
- 婚姻・現在: `--color-relation-marriage-current` 実線
- 婚姻・離婚: `--color-relation-marriage-divorced` 破線
- 婚姻・死別: `--color-relation-marriage-widowed` 二重線

---

## 2. ノードのデザイン
- サイズ: 標準 160 × 88 px (PC)
- 構成:
  ```
  ┌────────────────────────┐
  │ [Avatar]  氏名         │
  │           1985 - 2023  │
  └────────────────────────┘
  ```
- ホバー時に近接ボタン (+親 / +子 / +配偶者) を周囲に表示
- 選択時はアウトライン強調 + DetailPanel オープン
- 死亡者は薄いグレー帯 / 「†」マーク

---

## 3. 描画技術選定

### 候補比較
| 候補 | メリット | デメリット |
|---|---|---|
| **自前 SVG + d3-hierarchy** | 完全制御、家系図特有のレイアウト (婚姻ノード) を表現可。CSS Modules と相性◎ | 実装コスト高 |
| react-flow | ノード/エッジの相互作用 UI が標準装備、ズームパン組込み | 家系図の婚姻ノード表現は工夫必要、CSS が独自 |
| dagre | 自動レイアウト (DAG) | 婚姻ノード・複数親の表現が困難、UI なし |
| go.js / mxGraph | 高機能 | ライセンス・サイズ |

### 採用方針
- **MVP は自前 SVG + d3-hierarchy ベースのカスタムレイアウト**
  - 婚姻ノード (MarriageNode) を仮想ノードとして導入
  - 子ノードは MarriageNode (or 単独親ノード) からぶら下げる
  - dagre は補助計算として検討余地あり (オープン事項)
- 描画は SVG (`<g>` ノードと `<path>` エッジ)
- インタラクションは React state + ポインタイベント
- ズーム/パンは `react-svg-pan-zoom` または自前 (オープン事項)

---

## 4. レイアウトアルゴリズム

### 入力
- `Person[]` (ノード)
- `Relation[]` (parent_child, marriage)

### グラフ正規化
1. 婚姻ペアごとに `MarriageNode` を生成
2. `parent_child` の `from_person_id` (親) を MarriageNode (両親が婚姻関係なら) または単独親に紐付ける
3. 子ノードは MarriageNode の下にぶら下げる
4. 結果として **DAG** を構築 (祖先方向に閉路がないことは Server Action で保証)

### 階層 (世代) 算出
- ルート探索: 親を持たない人物を「世代 0」
- BFS で各人物の最大世代を算出 (複数親で世代差がある場合は max)
- MarriageNode の世代は配偶者の min(世代)

### X 座標決定 (重要)
- 兄弟は左から生年順に並べる (生年不明は末尾)
- サブツリーの幅を再帰計算し、親 (婚姻ノード) を子の中央に配置
- 複数婚 (再婚) は順序: 結婚開始年が早い順に左から配置
- 重なり回避: 同世代内で X 座標を均す (`d3-hierarchy` の `tidy` レイアウトを参考)

### Y 座標決定
- 世代 i は `i * GENERATION_GAP` (例: 180 px)
- MarriageNode は親世代 +0.5 (横線として中央に)

### キャッシュ
- レイアウト計算結果はノード/エッジ追加時に差分更新ではなく毎回再計算 (数十人規模なら問題ない)
- 計算は WebWorker に逃すのは将来検討 (NFR-P1: 数十人 3 秒以内)

---

## 5. ズーム・パン (FR-V2)
- 対応操作:
  - PC: マウスホイールでズーム / ドラッグでパン / トラックパッド ピンチ
  - タッチ: ピンチでズーム / 2 本指ドラッグでパン
- ズーム範囲: 0.25x 〜 4x
- 「全体表示にフィット」「100%」ボタンを TreeToolbar に配置
- 実装: SVG の `viewBox` を更新する方式 (DOM 大量更新を避ける)

---

## 6. 近接ボタン (FR-V5)
- ノード周囲に半径 ~80px の位置に 3 ボタンを配置
  - 上: `+ 親`
  - 下: `+ 子`
  - 横: `+ 配偶者`
- ボタンクリック → モーダルで `PersonForm` 起動 → `quickAddRelative` 呼び出し
- `+ 子` で複数配偶者がいる場合: 配偶者ペア選択ポップオーバーを挟む
- ホバー判定はノード + ボタン領域を含む見えない四角形で安定化

---

## 7. タイムライン連動 (FR-TL1, FR-TL2, FR-TL3)

### タイムラインのデータ構造
- 各人物の生没期間 (出生年 → 没年 / 存命なら現在)
- イベントマーカー: 生誕 / 婚姻 / 没

### 写真の自動切替
- DetailPanel で表示中の人物に対し:
  1. `currentYear` を Zustand から取得
  2. `currentYear` がない → 代表写真を表示
  3. `currentYear` あり → その人物に紐づく写真群から `taken_year` (+月日) と `currentYear` の差が最小の写真を選択
  4. 同点なら新しい方
  5. 撮影日のない写真は対象外 (FR-TL3)

### 共通ロジック
```ts
// lib/photo/select-by-year.ts
function pickPhotoByYear(
  photos: Photo[],
  year: number | null,
  fallback: Photo | null
): Photo | null;
```

### タイムライン UI 連動
- 年スライダー: クリック / ドラッグで currentYear 更新
- ツリー上のノードでも視覚効果 (生年 ≤ currentYear ≤ 没年 のノードを強調、それ以外は薄く)

---

## 8. パフォーマンス考慮 (NFR-P1, NFR-P2)
- 数十人規模 → SVG 描画で十分 (1000 ノード未満)
- React 再レンダリング最適化:
  - ノードコンポーネントは `React.memo`
  - Zustand のセレクタで selectedPersonId などを部分購読
- 写真は `next/image` (Supabase Image Transformation 経由) で遅延読み込み
- 100 人超のツリーが必要になった場合は仮想化 / Canvas へ移行を検討 (オープン事項)

---

## 9. エクスポート連携 (FR-E1, FR-E2)
- PNG: ツリーキャンバスの SVG を直列化 → `html-to-image` で PNG 生成 (クライアント側)
- PDF: クライアント側で `jsPDF` + 画像埋め込み or サーバー側 puppeteer
- 用紙サイズ・方向はエクスポート画面で選択
- 詳細は [api-design.md](./api-design.md#route-handlers-一覧) を参照

---

## 10. アクセシビリティ
- ノードはキーボードフォーカス可能 (Tab / 矢印キーで移動 — 将来検討)
- 各ノードに aria-label (氏名 + 生没年)
- 線の意味は色のみに依存しないよう、凡例 (Legend) を別途用意

---

## 11. オープン事項
- O-TV1: SVG 自前 vs react-flow の最終決定 (試作プロトタイプで判断)
- O-TV2: ズーム/パンライブラリの選定 (`react-svg-pan-zoom` / `d3-zoom` / 自前)
- O-TV3: 婚姻ノードの視覚表現 (小さな菱形 vs 横線のみ vs アイコン)
- O-TV4: 複数親の場合の親同士の婚姻情報がないケース (実母 + 別の養父) のレイアウト
- O-TV5: 100 人超対応の WebWorker レイアウト計算化
- O-TV6: 「不明な親」プレースホルダノードを実体化するかしないか (UI 上仮想表示するだけにするか)
- O-TV7: タイムラインスライダーの粒度 (年単位 vs 年月単位)
- O-TV8: タイムライン上の写真マーカー表示の有無 (ノイズになる可能性)
