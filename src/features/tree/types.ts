/**
 * 家系図ツリー レイアウト型定義
 *
 * tree-visualization-design.md §4 レイアウトアルゴリズム に準拠。
 * 婚姻ノード (MarriageNode) を仮想中間ノードとして導入し、
 * PersonNode と組み合わせて DAG を構成する。
 */

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------

/** 世代間の縦方向間隔 (px) */
export const GENERATION_GAP = 180;

/** ノード幅 (px) */
export const NODE_WIDTH = 160;

/** ノード高 (px) */
export const NODE_HEIGHT = 88;

/** ノード間の最小横間隔 (px) */
export const NODE_H_GAP = 40;

/** 婚姻ノードの表示サイズ (px, 菱形の対角線長) */
export const MARRIAGE_NODE_SIZE = 16;

// ---------------------------------------------------------------------------
// 入力型: Person / Relation (DB 行を表すシンプルな型)
// ---------------------------------------------------------------------------

/**
 * レイアウト計算に必要な Person フィールドのみ抜粋。
 * Supabase から取得した行をそのまま渡せる。
 */
export interface PersonForLayout {
  id: string;
  birth_year: number | null;
}

/**
 * レイアウト計算に必要な Relation フィールドのみ抜粋。
 * kind = 'parent_child' | 'marriage'
 */
export interface RelationForLayout {
  id: string;
  kind: 'parent_child' | 'marriage';
  /** parent_child: 親, marriage: パートナーA */
  from_person_id: string;
  /** parent_child: 子, marriage: パートナーB */
  to_person_id: string;
  /** marriage のみ: 婚姻開始年 (並び順に使用) */
  start_year: number | null;
  /** marriage のみ: 婚姻状態 */
  marriage_status: 'current' | 'divorced' | 'widowed' | null;
  /** marriage のみ: 婚姻種別 */
  marriage_type: 'spouse' | 'common_law' | 'same_sex_partner' | null;
  /** parent_child のみ: 親の役割 */
  parent_role: 'biological' | 'adoptive' | 'step' | null;
}

// ---------------------------------------------------------------------------
// 出力型: HierarchyNode (PersonNode | MarriageNode)
// ---------------------------------------------------------------------------

/**
 * 人物ノード (SVG 上に描画される四角いノード)
 */
export interface PersonNode {
  type: 'person';
  /** person.id */
  id: string;
  /** 論理世代 (0 = ルート世代) */
  generation: number;
  /** SVG 中心 X 座標 */
  x: number;
  /** SVG 中心 Y 座標 */
  y: number;
}

/**
 * 婚姻ノード (配偶者ペアを表す仮想ノード — SVG 上では小さな菱形または横線の中点)
 *
 * id は `marriage:{relation.id}` の形式で自動生成。
 * y 座標は親世代 + GENERATION_GAP * 0.5 に配置し、横線を表現する。
 */
export interface MarriageNode {
  type: 'marriage';
  /** `marriage:{relation.id}` */
  id: string;
  /** 対応する relation.id */
  relationId: string;
  /** 配偶者 A の person.id */
  partnerAId: string;
  /** 配偶者 B の person.id */
  partnerBId: string;
  /** marriage_status */
  marriageStatus: 'current' | 'divorced' | 'widowed';
  /** marriage_type */
  marriageType: 'spouse' | 'common_law' | 'same_sex_partner';
  /** 婚姻ノードが属する論理世代 (配偶者の min(generation) と同値) */
  generation: number;
  /** SVG 中心 X 座標 (両配偶者ノードの中央) */
  x: number;
  /** SVG 中心 Y 座標 (世代 + 0.5 相当) */
  y: number;
}

/** ノードの共用体型 */
export type HierarchyNode = PersonNode | MarriageNode;

// ---------------------------------------------------------------------------
// 出力型: TreeEdge
// ---------------------------------------------------------------------------

/**
 * エッジ種別
 * - marriage_line: 配偶者 A/B ↔ 婚姻ノードの横線
 * - parent_child_line: 婚姻ノード (または単独親) → 子 の縦線
 */
export type EdgeKind = 'marriage_line' | 'parent_child_line';

export interface TreeEdge {
  id: string;
  kind: EdgeKind;
  /** 元ノード id (PersonNode.id or MarriageNode.id) */
  fromId: string;
  /** 先ノード id (PersonNode.id or MarriageNode.id) */
  toId: string;
  /** parent_child の場合の親役割 (スタイリング用) */
  parentRole?: 'biological' | 'adoptive' | 'step';
  /** marriage の場合のステータス (スタイリング用) */
  marriageStatus?: 'current' | 'divorced' | 'widowed';
}

// ---------------------------------------------------------------------------
// 出力型: TreeLayout
// ---------------------------------------------------------------------------

/**
 * `buildTreeLayout` が返すレイアウト結果。
 * SVG 描画コンポーネントはこの型を受け取って描画する。
 */
export interface TreeLayout {
  /** 全ノード (PersonNode + MarriageNode) */
  nodes: HierarchyNode[];
  /** 全エッジ */
  edges: TreeEdge[];
  /** SVG キャンバス全体の幅 (px) */
  totalWidth: number;
  /** SVG キャンバス全体の高さ (px) */
  totalHeight: number;
}
