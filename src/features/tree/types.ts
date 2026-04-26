/**
 * tree/types.ts
 *
 * 家系図ツリー描画に使用する型定義。
 * tree-visualization-design.md の表示モデルに準拠。
 */

// ─────────────────────────────────────────────────────────
// ノード型
// ─────────────────────────────────────────────────────────

/** 人物ノード */
export interface PersonNode {
  type: 'person';
  id: string;
  displayName: string;
  birthYear: number | null;
  deathYear: number | null;
  gender: string | null;
  /** 代表写真 URL (Supabase Image Transformation 経由) */
  primaryPhotoUrl: string | null;
  /** X 座標 (左端基準) */
  x: number;
  /** Y 座標 (上端基準) */
  y: number;
  /** 世代番号 */
  generation: number;
}

/** 婚姻ノード (仮想ノード) */
export interface MarriageNode {
  type: 'marriage';
  id: string;
  /** 配偶者 A の personId */
  personIdA: string;
  /** 配偶者 B の personId */
  personIdB: string;
  /** 婚姻種別 */
  marriageType: 'spouse' | 'common_law' | 'same_sex_partner';
  /** 婚姻ステータス */
  marriageStatus: 'current' | 'divorced' | 'widowed';
  /** X 座標 */
  x: number;
  /** Y 座標 */
  y: number;
  /** 世代番号 (配偶者 min 世代) */
  generation: number;
}

/** HierarchyNode の Union 型 */
export type HierarchyNode = PersonNode | MarriageNode;

// ─────────────────────────────────────────────────────────
// エッジ型
// ─────────────────────────────────────────────────────────

/** 婚姻線 (PersonNode ↔ MarriageNode) */
export interface MarriageEdge {
  type: 'marriage_line';
  id: string;
  fromPersonId: string;
  toMarriageId: string;
}

/** 親子線 (MarriageNode or PersonNode → PersonNode) */
export interface ParentChildEdge {
  type: 'parent_child_line';
  id: string;
  /** MarriageNode.id または PersonNode.id */
  fromId: string;
  toPersonId: string;
  /** 親子関係の種別 */
  parentRole: 'biological' | 'adoptive' | 'step';
}

/** TreeEdge の Union 型 */
export type TreeEdge = MarriageEdge | ParentChildEdge;

// ─────────────────────────────────────────────────────────
// レイアウト出力型
// ─────────────────────────────────────────────────────────

/** buildTreeLayout の返り値 */
export interface TreeLayout {
  nodes: HierarchyNode[];
  edges: TreeEdge[];
  totalWidth: number;
  totalHeight: number;
}

// ─────────────────────────────────────────────────────────
// ノードサイズ定数
// ─────────────────────────────────────────────────────────

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 88;
export const MARRIAGE_NODE_SIZE = 16;
export const GENERATION_GAP = 180;
