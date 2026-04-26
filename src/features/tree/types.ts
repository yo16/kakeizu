/**
 * ツリービジュアライゼーション用の型定義
 *
 * PersonNode / MarriageNode の選択状態管理に使用する。
 */

/** 選択可能なノードの種別 */
export type NodeKind = 'person' | 'marriage';

/** 選択中のノード情報 */
export interface SelectedNode {
  /** ノードの種別 */
  kind: NodeKind;
  /** ノードの ID (person.id または marriage relation の id) */
  id: string;
}
