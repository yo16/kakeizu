/**
 * buildTreeLayout.ts
 *
 * 人物リスト + 関係リストから描画用レイアウトデータを生成する。
 * tree-visualization-design.md §4 レイアウトアルゴリズム に準拠。
 *
 * - 婚姻ペアごとに MarriageNode を生成
 * - 世代 (generation) を BFS で算出
 * - X 座標はサブツリー幅の再帰計算で決定
 */

import {
  type HierarchyNode,
  type MarriageEdge,
  type MarriageNode,
  type ParentChildEdge,
  type PersonNode,
  type TreeEdge,
  type TreeLayout,
  GENERATION_GAP,
  MARRIAGE_NODE_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from '../types';

// ─── ローカル入力型 (actions からの依存を避けるため定義) ──
export interface PersonInput {
  id: string;
  displayName: string;
  birthYear: number | null;
  gender: string | null;
}

export interface RelationInput {
  id: string;
  kind: 'parent_child' | 'marriage';
  fromPersonId: string;
  toPersonId: string;
  parentRole: string | null;
  marriageType: string | null;
  marriageStatus: string | null;
}

// ─────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────

const HORIZONTAL_GAP = 24; // ノード間の水平マージン
const PADDING = 32; // キャンバス周囲の余白

// ─────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────

function makeMarriageNodeId(personIdA: string, personIdB: string): string {
  // 順序を正規化して一意の ID を生成
  const sorted = [personIdA, personIdB].sort();
  return `marriage:${sorted[0]}:${sorted[1]}`;
}

// ─────────────────────────────────────────────────────────
// メイン関数
// ─────────────────────────────────────────────────────────

/**
 * ツリーレイアウトを計算する。
 *
 * @param persons - 人物一覧
 * @param relations - 関係一覧
 * @returns TreeLayout
 */
export function buildTreeLayout(
  persons: PersonInput[],
  relations: RelationInput[]
): TreeLayout {
  if (persons.length === 0) {
    return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 };
  }

  // ─── 1. 婚姻ペアから MarriageNode を生成 ──────────────────
  const marriageRelations = relations.filter((r) => r.kind === 'marriage');
  const parentChildRelations = relations.filter((r) => r.kind === 'parent_child');

  // personId → MarriageNode[] のマップ (複数婚対応)
  const personToMarriages = new Map<string, MarriageNode[]>();
  // marriageNodeId → MarriageNode
  const marriageNodeMap = new Map<string, MarriageNode>();

  for (const rel of marriageRelations) {
    const nodeId = makeMarriageNodeId(rel.fromPersonId, rel.toPersonId);

    if (!marriageNodeMap.has(nodeId)) {
      const marriageType = ((): MarriageNode['marriageType'] => {
        if (rel.marriageType === 'common_law') return 'common_law';
        if (rel.marriageType === 'same_sex_partner') return 'same_sex_partner';
        return 'spouse';
      })();

      const marriageStatus = ((): MarriageNode['marriageStatus'] => {
        if (rel.marriageStatus === 'divorced') return 'divorced';
        if (rel.marriageStatus === 'widowed') return 'widowed';
        return 'current';
      })();

      const node: MarriageNode = {
        type: 'marriage',
        id: nodeId,
        personIdA: rel.fromPersonId,
        personIdB: rel.toPersonId,
        marriageType,
        marriageStatus,
        x: 0,
        y: 0,
        generation: 0,
      };
      marriageNodeMap.set(nodeId, node);
    }

    const node = marriageNodeMap.get(nodeId)!;
    for (const pid of [rel.fromPersonId, rel.toPersonId]) {
      const list = personToMarriages.get(pid) ?? [];
      if (!list.includes(node)) list.push(node);
      personToMarriages.set(pid, list);
    }
  }

  // ─── 2. 親子関係の解析 ─────────────────────────────────────
  // 子 personId → 親 ID (MarriageNode.id or PersonNode.id)
  const childToParent = new Map<string, string>();
  // 親 ID → 子 personId[]
  const parentToChildren = new Map<string, string[]>();

  for (const rel of parentChildRelations) {
    // fromPersonId が親、toPersonId が子
    const parentId = rel.fromPersonId;
    const childId = rel.toPersonId;

    // 婚姻ノードが存在する場合は婚姻ノード経由
    const marriages = personToMarriages.get(parentId) ?? [];
    // 子をもつ婚姻ノードを探す（簡易: 最初の婚姻ノードを使用）
    const marriageNode = marriages[0];
    const effectiveParentId = marriageNode ? marriageNode.id : parentId;

    childToParent.set(childId, effectiveParentId);
    const children = parentToChildren.get(effectiveParentId) ?? [];
    if (!children.includes(childId)) children.push(childId);
    parentToChildren.set(effectiveParentId, children);
  }

  // ─── 3. 世代算出 (BFS) ────────────────────────────────────
  const personGeneration = new Map<string, number>();

  // ルート (親を持たない人物)
  const personIds = persons.map((p) => p.id);
  const roots = personIds.filter((id) => !childToParent.has(id));

  // BFS
  const queue: Array<{ id: string; gen: number }> = roots.map((id) => ({ id, gen: 0 }));
  while (queue.length > 0) {
    const item = queue.shift()!;
    const currentGen = personGeneration.get(item.id);
    if (currentGen !== undefined && currentGen >= item.gen) continue;
    personGeneration.set(item.id, item.gen);

    // 婚姻ノード経由の子
    const marriages = personToMarriages.get(item.id) ?? [];
    for (const marriage of marriages) {
      const children = parentToChildren.get(marriage.id) ?? [];
      for (const childId of children) {
        queue.push({ id: childId, gen: item.gen + 1 });
      }
    }

    // 直接親子 (婚姻なし)
    const directChildren = parentToChildren.get(item.id) ?? [];
    for (const childId of directChildren) {
      queue.push({ id: childId, gen: item.gen + 1 });
    }
  }

  // 世代が未設定の人物は 0 世代として扱う
  for (const id of personIds) {
    if (!personGeneration.has(id)) personGeneration.set(id, 0);
  }

  // 婚姻ノードの世代は配偶者の min 世代
  for (const [, node] of marriageNodeMap) {
    const genA = personGeneration.get(node.personIdA) ?? 0;
    const genB = personGeneration.get(node.personIdB) ?? 0;
    node.generation = Math.min(genA, genB);
  }

  // ─── 4. X 座標算出 ────────────────────────────────────────
  // 世代ごとに人物を分類
  const genToPersonIds = new Map<number, string[]>();
  for (const [pid, gen] of personGeneration.entries()) {
    const list = genToPersonIds.get(gen) ?? [];
    list.push(pid);
    genToPersonIds.set(gen, list);
  }

  // 各世代内で生年順にソート
  for (const [, list] of genToPersonIds.entries()) {
    list.sort((a, b) => {
      const pa = persons.find((p) => p.id === a);
      const pb = persons.find((p) => p.id === b);
      const ya = pa?.birthYear ?? Infinity;
      const yb = pb?.birthYear ?? Infinity;
      return ya - yb;
    });
  }

  // X 座標を世代ごとに均等配置
  const personX = new Map<string, number>();
  let maxX = 0;

  const maxGen = Math.max(...Array.from(personGeneration.values()));
  for (let gen = 0; gen <= maxGen; gen++) {
    const list = genToPersonIds.get(gen) ?? [];
    let currentX = PADDING;
    for (const pid of list) {
      personX.set(pid, currentX);
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
    }
    if (currentX > maxX) maxX = currentX;
  }

  // 婚姻ノードの X は配偶者の中間
  for (const [, node] of marriageNodeMap) {
    const xA = personX.get(node.personIdA) ?? 0;
    const xB = personX.get(node.personIdB) ?? 0;
    node.x = (xA + xB) / 2 + NODE_WIDTH / 2 - MARRIAGE_NODE_SIZE / 2;
  }

  // ─── 5. PersonNode の組み立て ─────────────────────────────
  const personNodeMap = new Map<string, PersonNode>();
  for (const person of persons) {
    const gen = personGeneration.get(person.id) ?? 0;
    const x = personX.get(person.id) ?? PADDING;
    const y = PADDING + gen * GENERATION_GAP;

    const node: PersonNode = {
      type: 'person',
      id: person.id,
      displayName: person.displayName,
      birthYear: person.birthYear,
      deathYear: null,
      gender: person.gender,
      primaryPhotoUrl: null,
      x,
      y,
      generation: gen,
    };
    personNodeMap.set(person.id, node);
  }

  // MarriageNode の Y を配偶者世代の Y + NODE_HEIGHT/2 に配置
  for (const [, node] of marriageNodeMap) {
    const gen = node.generation;
    node.y = PADDING + gen * GENERATION_GAP + NODE_HEIGHT / 2 - MARRIAGE_NODE_SIZE / 2;
  }

  // ─── 6. エッジ組み立て ────────────────────────────────────
  const edges: TreeEdge[] = [];

  // 婚姻線 (PersonNode → MarriageNode)
  for (const [, mNode] of marriageNodeMap) {
    const edgeA: MarriageEdge = {
      type: 'marriage_line',
      id: `marriage-line-a:${mNode.id}`,
      fromPersonId: mNode.personIdA,
      toMarriageId: mNode.id,
    };
    const edgeB: MarriageEdge = {
      type: 'marriage_line',
      id: `marriage-line-b:${mNode.id}`,
      fromPersonId: mNode.personIdB,
      toMarriageId: mNode.id,
    };
    edges.push(edgeA, edgeB);
  }

  // 親子線 (MarriageNode or PersonNode → PersonNode)
  for (const rel of parentChildRelations) {
    const parentId = rel.fromPersonId;
    const childId = rel.toPersonId;
    const marriages = personToMarriages.get(parentId) ?? [];
    const effectiveParentId = marriages[0] ? marriages[0].id : parentId;

    const parentRole = ((): ParentChildEdge['parentRole'] => {
      if (rel.parentRole === 'adoptive') return 'adoptive';
      if (rel.parentRole === 'step') return 'step';
      return 'biological';
    })();

    const edge: ParentChildEdge = {
      type: 'parent_child_line',
      id: `parent-child:${rel.id}`,
      fromId: effectiveParentId,
      toPersonId: childId,
      parentRole,
    };
    edges.push(edge);
  }

  // ─── 7. 全ノードをまとめる ────────────────────────────────
  const nodes: HierarchyNode[] = [
    ...Array.from(personNodeMap.values()),
    ...Array.from(marriageNodeMap.values()),
  ];

  const totalWidth = maxX + PADDING;
  const totalHeight = PADDING + (maxGen + 1) * GENERATION_GAP + NODE_HEIGHT + PADDING;

  return { nodes, edges, totalWidth, totalHeight };
}
