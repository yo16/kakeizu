/**
 * buildTreeLayout
 *
 * tree-visualization-design.md §4 レイアウトアルゴリズム に準拠した
 * 縦型家系図レイアウト計算関数。
 *
 * 設計方針:
 *   - d3-hierarchy パッケージを依存に追加済み (fvp.2 で SVG 描画に利用予定)。
 *     本関数では世代ベースの自前計算を行うが、d3 の HierarchyNode 型概念を参考に設計している。
 *   - 婚姻ノード (MarriageNode) を仮想中間ノードとして生成し、
 *     「配偶者 ← 婚姻ノード → 子」のグラフ構造で DAG を構築する。
 *   - X 座標: Reingold-Tilford (tidy tree) を参考にしたポストオーダーのサブツリー幅集計
 *   - Y 座標: 世代 i = i * GENERATION_GAP, MarriageNode = (世代 + 0.5) * GENERATION_GAP
 */

import {
  GENERATION_GAP,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_H_GAP,
  type HierarchyNode,
  type MarriageNode,
  type PersonForLayout,
  type RelationForLayout,
  type TreeEdge,
  type TreeLayout,
} from '../types';

// ---------------------------------------------------------------------------
// 内部型
// ---------------------------------------------------------------------------

/** 内部処理用の PersonNode 構造 (x は後で確定する) */
interface InternalPersonNode {
  type: 'person';
  id: string;
  generation: number;
  x: number;
  y: number;
  /** サブツリーの幅 (px) — X 座標配置の計算に使用 */
  subtreeWidth: number;
}

/** 内部処理用の MarriageNode 構造 */
interface InternalMarriageNode {
  type: 'marriage';
  id: string;
  relationId: string;
  partnerAId: string;
  partnerBId: string;
  marriageStatus: 'current' | 'divorced' | 'widowed';
  marriageType: 'spouse' | 'common_law' | 'same_sex_partner';
  generation: number;
  x: number;
  y: number;
  /** 子 PersonNode の id リスト (生年昇順・生年不明末尾) */
  childIds: string[];
  /** 婚姻開始年 (配偶者間での並び順に使用) */
  startYear: number | null;
}

type InternalNode = InternalPersonNode | InternalMarriageNode;

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * persons と relations からツリーレイアウトを計算して返す。
 *
 * @param persons - tree に属する全人物
 * @param relations - tree に属する全関係 (parent_child + marriage)
 * @returns TreeLayout
 */
export function buildTreeLayout(
  persons: PersonForLayout[],
  relations: RelationForLayout[]
): TreeLayout {
  if (persons.length === 0) {
    return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 };
  }

  // ----------------------------------------------------------------
  // Step 1: 婚姻リレーションから MarriageNode を生成
  // ----------------------------------------------------------------
  const marriages = relations.filter((r) => r.kind === 'marriage');
  const parentChildRelations = relations.filter((r) => r.kind === 'parent_child');

  /**
   * 各婚姻 relation.id → InternalMarriageNode のマップ
   */
  const marriageNodeMap = new Map<string, InternalMarriageNode>();
  for (const rel of marriages) {
    const nodeId = `marriage:${rel.id}`;
    marriageNodeMap.set(rel.id, {
      type: 'marriage',
      id: nodeId,
      relationId: rel.id,
      partnerAId: rel.fromPersonId,
      partnerBId: rel.toPersonId,
      marriageStatus: rel.marriageStatus ?? 'current',
      marriageType: rel.marriageType ?? 'spouse',
      generation: 0, // 後で確定
      x: 0,
      y: 0,
      childIds: [],
      startYear: rel.startYear,
    });
  }

  // ----------------------------------------------------------------
  // Step 2: 親子リレーションを解析し、各子に対して「親婚姻ノード」を特定
  //
  // 親が 2 人いる場合: その 2 人の間に婚姻ノードがあれば → 婚姻ノードにぶら下げる
  // 親が 1 人の場合: 単独親扱い → 親 PersonNode に直接ぶら下げる
  // ----------------------------------------------------------------

  /** person.id → 親 person.id[] */
  const childToParents = new Map<string, string[]>();
  /** person.id → 子 person.id[] */
  const personToChildren = new Map<string, string[]>();

  for (const rel of parentChildRelations) {
    // childToParents
    const parents = childToParents.get(rel.toPersonId) ?? [];
    parents.push(rel.fromPersonId);
    childToParents.set(rel.toPersonId, parents);

    // personToChildren
    const children = personToChildren.get(rel.fromPersonId) ?? [];
    children.push(rel.toPersonId);
    personToChildren.set(rel.fromPersonId, children);
  }

  /**
   * child person.id → 親婚姻ノード id (または null = 単独親)
   * 単独親の場合は親 person.id を使う
   */
  const childToParentNodeId = new Map<string, string>();

  /**
   * 親 person.id → その人が持つ婚姻ノード id のリスト
   * (再婚で複数婚姻ノードを持つ場合に使用)
   */
  const personToMarriageNodeIds = new Map<string, string[]>();

  for (const [, node] of marriageNodeMap) {
    for (const pid of [node.partnerAId, node.partnerBId]) {
      const ids = personToMarriageNodeIds.get(pid) ?? [];
      ids.push(node.id);
      personToMarriageNodeIds.set(pid, ids);
    }
  }

  for (const [childId, parents] of childToParents) {
    if (parents.length >= 2) {
      // 2 親: 両親間に婚姻ノードがあるか探す (防御的に最初の2人のみ使用)
      const [p1, p2] = parents.slice(0, 2);
      const marriageNode = findMarriageNodeBetween(p1, p2, marriageNodeMap);
      if (marriageNode) {
        childToParentNodeId.set(childId, marriageNode.id);
        if (!marriageNode.childIds.includes(childId)) {
          marriageNode.childIds.push(childId);
        }
      } else {
        // 婚姻ノードが存在しない 2 親 → 最初の親を単独親扱い
        childToParentNodeId.set(childId, p1);
      }
    } else if (parents.length === 1) {
      const parentId = parents[0];
      // 単独親: 婚姻ノードが存在すれば、その婚姻ノードにぶら下げる
      // (DB では parent_child の from が親、marriage の from/to がパートナーなので、
      //  "この親"が関わる婚姻ノードを探してそこに子を紐付ける。
      //  ただし子が明示的にどの婚姻から生まれたか不明なケースは単独親扱いとする)
      childToParentNodeId.set(childId, parentId);
    }
  }

  // 婚姻ノードのうち、childIds が 0 のままのものは "子なし婚姻" として残す
  // (描画上は 2 パートナー間の横線のみ)

  // ----------------------------------------------------------------
  // Step 3: BFS で世代を算出 (PersonNode)
  //
  // ルート: 親を持たない人物 → 世代 0
  // 子は max(親世代) + 1
  // ----------------------------------------------------------------
  const personIds = persons.map((p) => p.id);
  const personSet = new Set(personIds);

  /** person.id → generation */
  const generationMap = new Map<string, number>();

  // 親を持たない人物をルートとして初期化
  const roots: string[] = [];
  for (const p of persons) {
    if (!childToParents.has(p.id) || childToParents.get(p.id)!.length === 0) {
      generationMap.set(p.id, 0);
      roots.push(p.id);
    }
  }

  // 孤立ノード (親も子も婚姻もない) もルートとして含まれることに注意
  // BFS
  const queue: string[] = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentGen = generationMap.get(current) ?? 0;
    const children = personToChildren.get(current) ?? [];
    for (const childId of children) {
      if (!personSet.has(childId)) continue;
      const existing = generationMap.get(childId);
      const newGen = currentGen + 1;
      if (existing === undefined || existing < newGen) {
        generationMap.set(childId, newGen);
        queue.push(childId);
      }
    }
  }

  // 世代が未確定の人物 (孤立ノード) を world 0 に割り当て
  for (const p of persons) {
    if (!generationMap.has(p.id)) {
      generationMap.set(p.id, 0);
    }
  }

  // MarriageNode の世代 = min(partnerA.generation, partnerB.generation)
  for (const [, mNode] of marriageNodeMap) {
    const genA = generationMap.get(mNode.partnerAId) ?? 0;
    const genB = generationMap.get(mNode.partnerBId) ?? 0;
    mNode.generation = Math.min(genA, genB);
  }

  // ----------------------------------------------------------------
  // Step 4: X 座標計算
  //
  // 世代ごとにノードを収集し、グループ化してサブツリー幅を計算。
  // Reingold-Tilford を参考に、再帰的にサブツリー幅を積み上げ、
  // 親 (婚姻ノード) を子グループの中央に置く。
  //
  // アルゴリズムの概要:
  //   1. 各 PersonNode のリーフ幅 = NODE_WIDTH
  //   2. 婚姻ノードの子を生年昇順に並べ、サブツリー幅を合計
  //   3. 婚姻ノード x = 子の中央
  //   4. 配偶者 2 人を婚姻ノードを中心に左右に配置
  //   5. 同世代内で x が重なる場合は右にシフト
  // ----------------------------------------------------------------

  /** person.id → InternalPersonNode */
  const personNodeMap = new Map<string, InternalPersonNode>();
  for (const p of persons) {
    const gen = generationMap.get(p.id) ?? 0;
    personNodeMap.set(p.id, {
      type: 'person',
      id: p.id,
      generation: gen,
      x: 0,
      y: gen * GENERATION_GAP,
      subtreeWidth: NODE_WIDTH,
    });
  }

  // 各婚姻ノードの子を生年昇順に並べる
  for (const [, mNode] of marriageNodeMap) {
    mNode.childIds = sortByBirthYear(mNode.childIds, persons);
  }

  // 単独親の子の並び替え (personToChildren も生年昇順に)
  for (const [parentId, childIds] of personToChildren) {
    personToChildren.set(parentId, sortByBirthYear(childIds, persons));
  }

  // サブツリー幅を計算し、X 座標を割り当てる
  // 処理順: 世代が大きい (葉) → 小さい (根) の順でボトムアップ
  const maxGen = Array.from(generationMap.values()).reduce((acc, g) => (g > acc ? g : acc), 0);

  // 世代ごとの "次に配置する X" を管理
  // 同世代内で重複が起きないよう、配置済み最大 X を追跡する
  const genNextX = new Map<number, number>();
  for (let g = 0; g <= maxGen; g++) {
    genNextX.set(g, 0);
  }

  // ----- サブツリー幅を先にボトムアップ計算 -----
  // 世代最大から 0 に向かって処理する
  const personsByGen: Map<number, string[]> = new Map();
  for (const [pid, gen] of generationMap) {
    const arr = personsByGen.get(gen) ?? [];
    arr.push(pid);
    personsByGen.set(gen, arr);
  }

  // 幅計算 (葉から根へ)
  computeSubtreeWidths(maxGen, personsByGen, personNodeMap, marriageNodeMap, childToParentNodeId, personToChildren, persons);

  // X 座標配置 (根から葉へ)
  placeNodes(roots, personNodeMap, marriageNodeMap, childToParentNodeId, personToChildren, persons, genNextX);

  // ----------------------------------------------------------------
  // Step 5: Y 座標を確定 (PersonNode は世代 * GAP, MarriageNode は (世代 + 0.5) * GAP)
  // ----------------------------------------------------------------
  for (const [, node] of personNodeMap) {
    node.y = node.generation * GENERATION_GAP;
  }
  for (const [, mNode] of marriageNodeMap) {
    mNode.y = (mNode.generation + 0.5) * GENERATION_GAP;
  }

  // ----------------------------------------------------------------
  // Step 6: エッジを生成
  // ----------------------------------------------------------------
  const edges: TreeEdge[] = [];

  // 婚姻エッジ (配偶者 → 婚姻ノード)
  for (const [, mNode] of marriageNodeMap) {
    edges.push({
      id: `edge:marriage_line:${mNode.id}:A`,
      kind: 'marriage_line',
      fromId: mNode.partnerAId,
      toId: mNode.id,
      marriageStatus: mNode.marriageStatus,
    });
    edges.push({
      id: `edge:marriage_line:${mNode.id}:B`,
      kind: 'marriage_line',
      fromId: mNode.partnerBId,
      toId: mNode.id,
      marriageStatus: mNode.marriageStatus,
    });

    // 婚姻ノード → 子
    for (const childId of mNode.childIds) {
      const rel = findParentChildRelation(mNode.partnerAId, mNode.partnerBId, childId, parentChildRelations);
      edges.push({
        id: `edge:parent_child_line:${mNode.id}:${childId}`,
        kind: 'parent_child_line',
        fromId: mNode.id,
        toId: childId,
        parentRole: rel?.parentRole ?? 'biological',
      });
    }
  }

  // 単独親 → 子 エッジ (婚姻ノードを介さないもの)
  for (const [childId, parentNodeId] of childToParentNodeId) {
    // 既に婚姻ノードから子へのエッジを追加済みのケースをスキップ
    const isMarriageNodeParent = parentNodeId.startsWith('marriage:');
    if (isMarriageNodeParent) continue;

    // 単独親ケース
    const rel = parentChildRelations.find(
      (r) => r.fromPersonId === parentNodeId && r.toPersonId === childId
    );
    edges.push({
      id: `edge:parent_child_line:${parentNodeId}:${childId}`,
      kind: 'parent_child_line',
      fromId: parentNodeId,
      toId: childId,
      parentRole: rel?.parentRole ?? 'biological',
    });
  }

  // ----------------------------------------------------------------
  // Step 7: TreeLayout を組み立てて返す
  // ----------------------------------------------------------------
  const allNodes: HierarchyNode[] = [];

  for (const [, pNode] of personNodeMap) {
    allNodes.push({
      type: 'person',
      id: pNode.id,
      generation: pNode.generation,
      x: pNode.x,
      y: pNode.y,
    });
  }

  for (const [, mNode] of marriageNodeMap) {
    const outputNode: MarriageNode = {
      type: 'marriage',
      id: mNode.id,
      relationId: mNode.relationId,
      partnerAId: mNode.partnerAId,
      partnerBId: mNode.partnerBId,
      marriageStatus: mNode.marriageStatus,
      marriageType: mNode.marriageType,
      generation: mNode.generation,
      x: mNode.x,
      y: mNode.y,
    };
    allNodes.push(outputNode);
  }

  // キャンバスサイズ計算
  const allX = allNodes.map((n) => n.x);
  const allY = allNodes.map((n) => n.y);
  const minX = allX.length > 0 ? Math.min(...allX) : 0;
  const maxX = allX.length > 0 ? Math.max(...allX) : 0;
  const maxY = allY.length > 0 ? Math.max(...allY) : 0;

  const padding = NODE_WIDTH;
  const totalWidth = maxX - minX + NODE_WIDTH + padding * 2;
  const totalHeight = maxY + NODE_HEIGHT + padding * 2;

  // X 座標をオフセット補正 (minX が負または小さい場合に左端余白を確保)
  const xOffset = padding + NODE_WIDTH / 2 - minX;
  for (const node of allNodes) {
    node.x += xOffset;
  }

  return {
    nodes: allNodes,
    edges,
    totalWidth,
    totalHeight,
  };
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** 2 人の person.id の間に婚姻ノードがあれば返す */
function findMarriageNodeBetween(
  p1: string,
  p2: string,
  marriageNodeMap: Map<string, InternalMarriageNode>
): InternalMarriageNode | null {
  for (const [, m] of marriageNodeMap) {
    if (
      (m.partnerAId === p1 && m.partnerBId === p2) ||
      (m.partnerAId === p2 && m.partnerBId === p1)
    ) {
      return m;
    }
  }
  return null;
}

/** MarriageNode の id ("marriage:xxx") から InternalMarriageNode を返す */
function getMarriageNodeByNodeId(
  nodeId: string,
  marriageNodeMap: Map<string, InternalMarriageNode>
): InternalMarriageNode | null {
  // nodeId = "marriage:{relationId}"
  const relationId = nodeId.replace('marriage:', '');
  return marriageNodeMap.get(relationId) ?? null;
}

/** 生年昇順にソート (生年不明は末尾) */
function sortByBirthYear(ids: string[], persons: PersonForLayout[]): string[] {
  const birthMap = new Map<string, number | null>();
  for (const p of persons) {
    birthMap.set(p.id, p.birth_year);
  }
  return [...ids].sort((a, b) => {
    const ya = birthMap.get(a) ?? null;
    const yb = birthMap.get(b) ?? null;
    if (ya === null && yb === null) return 0;
    if (ya === null) return 1; // null は末尾
    if (yb === null) return -1;
    return ya - yb;
  });
}

/**
 * 単独親の直接の子 ID リストを返す。
 * 婚姻ノードを介した子は含まない。
 */
function getDirectChildIds(
  personId: string,
  childToParentNodeId: Map<string, string>,
  personToChildren: Map<string, string[]>
): string[] {
  const allChildren = personToChildren.get(personId) ?? [];
  return allChildren.filter((cid) => childToParentNodeId.get(cid) === personId);
}

/**
 * 親子リレーションから特定の親-子間のリレーションを返す。
 * 2 親の場合はどちらか一方でマッチすれば返す。
 */
function findParentChildRelation(
  parentAId: string,
  parentBId: string,
  childId: string,
  parentChildRelations: RelationForLayout[]
): RelationForLayout | null {
  return (
    parentChildRelations.find(
      (r) =>
        r.toPersonId === childId &&
        (r.fromPersonId === parentAId || r.fromPersonId === parentBId)
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// サブツリー幅計算 (ボトムアップ)
// ---------------------------------------------------------------------------

/**
 * ボトムアップでサブツリー幅を計算する。
 * 婚姻ノードに子がある場合は子の幅を集計し、
 * 婚姻ノード幅 = max(NODE_WIDTH * 2 + NODE_H_GAP, 子の合計幅) とする。
 */
function computeSubtreeWidths(
  maxGen: number,
  personsByGen: Map<number, string[]>,
  personNodeMap: Map<string, InternalPersonNode>,
  marriageNodeMap: Map<string, InternalMarriageNode>,
  childToParentNodeId: Map<string, string>,
  personToChildren: Map<string, string[]>,
  persons: PersonForLayout[]
): void {
  for (let g = maxGen; g >= 0; g--) {
    const pids = personsByGen.get(g) ?? [];
    for (const pid of pids) {
      const pNode = personNodeMap.get(pid)!;
      // 単独親としての直接の子
      const directChildren = getDirectChildIds(pid, childToParentNodeId, personToChildren);
      if (directChildren.length === 0) {
        pNode.subtreeWidth = NODE_WIDTH;
      } else {
        let w = 0;
        for (const cid of directChildren) {
          const childNode = personNodeMap.get(cid)!;
          w += childNode.subtreeWidth + NODE_H_GAP;
        }
        w -= NODE_H_GAP;
        pNode.subtreeWidth = Math.max(NODE_WIDTH, w);
      }
    }
  }

  // 婚姻ノードのサブツリー幅: 子の合計幅 OR 両パートナー幅
  // partnerB が独自の再婚サブツリーを持つ場合も考慮する
  for (const [, mNode] of marriageNodeMap) {
    const partnerANode = personNodeMap.get(mNode.partnerAId);
    const partnerBNode = personNodeMap.get(mNode.partnerBId);

    // partnerB 自身の subtreeWidth を取得
    // partnerB が別の婚姻グループの partnerA の場合は既に計算済みの幅を使う
    const partnerAWidth = partnerANode?.subtreeWidth ?? NODE_WIDTH;
    const partnerBWidth = partnerBNode?.subtreeWidth ?? NODE_WIDTH;
    const coupleWidth = partnerAWidth + NODE_H_GAP + partnerBWidth;

    if (mNode.childIds.length === 0) {
      // 子なし: 2 パートナー分の幅 (partnerB の独自サブツリーも含む coupleWidth)
      if (partnerANode && partnerANode.subtreeWidth < coupleWidth) {
        partnerANode.subtreeWidth = coupleWidth;
      }
    } else {
      let childTotalWidth = 0;
      for (const cid of mNode.childIds) {
        const childNode = personNodeMap.get(cid)!;
        childTotalWidth += childNode.subtreeWidth + NODE_H_GAP;
      }
      childTotalWidth -= NODE_H_GAP;
      // marriage subtree 幅 = max(coupleWidth, 子合計幅)
      // 婚姻ノード自身には subtreeWidth フィールドがないが、配置関数で利用する
      // ここでは partnerA の subtreeWidth を "この婚姻グループ全体幅" として設定
      if (partnerANode) {
        partnerANode.subtreeWidth = Math.max(coupleWidth, childTotalWidth);
      }
    }
  }
}

/**
 * ルートから再帰的に X 座標を配置する。
 */
function placeNodes(
  roots: string[],
  personNodeMap: Map<string, InternalPersonNode>,
  marriageNodeMap: Map<string, InternalMarriageNode>,
  childToParentNodeId: Map<string, string>,
  personToChildren: Map<string, string[]>,
  persons: PersonForLayout[],
  genNextX: Map<number, number>
): void {
  /** 配置済みの person.id を管理する Set */
  const placed = new Set<string>();

  /**
   * personId の X 座標を確定し、再帰的に子を配置する。
   * @param personId - 配置対象の人物 ID
   * @param suggestedX - 上から提案された X 座標の中心 (null = まだ未決定)
   */
  function placePerson(personId: string, suggestedX: number | null): void {
    const pNode = personNodeMap.get(personId);
    if (!pNode) return;
    if (placed.has(personId)) return; // 既に配置済み (再婚などで複数経路からアクセスされる場合)

    const gen = pNode.generation;
    const nextX = genNextX.get(gen) ?? 0;

    // partnerA として担当する婚姻ノードを婚姻開始年昇順で取得
    const ownMarriageNodes = getOwnMarriageNodes(personId, marriageNodeMap);

    if (ownMarriageNodes.length === 0) {
      // 配偶者なし
      const directChildren = getDirectChildIds(personId, childToParentNodeId, personToChildren);

      let finalX: number;
      if (directChildren.length > 0) {
        // 子の中央に配置
        const totalChildWidth = directChildren.reduce((sum, cid) => {
          return sum + (personNodeMap.get(cid)?.subtreeWidth ?? NODE_WIDTH) + NODE_H_GAP;
        }, -NODE_H_GAP);
        const startX = Math.max(suggestedX !== null ? suggestedX - totalChildWidth / 2 : nextX, nextX);
        finalX = startX + totalChildWidth / 2;

        // 子を左から配置
        let curX = startX;
        for (const cid of directChildren) {
          const cNode = personNodeMap.get(cid)!;
          placePerson(cid, curX + cNode.subtreeWidth / 2);
          curX += cNode.subtreeWidth + NODE_H_GAP;
        }
      } else {
        finalX = suggestedX !== null ? Math.max(suggestedX, nextX) : nextX + NODE_WIDTH / 2;
      }

      pNode.x = finalX;
      placed.add(personId);
      genNextX.set(gen, Math.max(nextX, finalX + NODE_WIDTH / 2 + NODE_H_GAP));
    } else {
      // 配偶者あり: 婚姻ノード群をまとめて配置
      let groupStartX = suggestedX !== null ? suggestedX - pNode.subtreeWidth / 2 : nextX;
      groupStartX = Math.max(groupStartX, nextX);

      let curX = groupStartX;
      let firstPartnerAX: number | null = null;

      for (const mNode of ownMarriageNodes) {
        const partnerBNode = personNodeMap.get(mNode.partnerBId);
        const partnerAWidth = NODE_WIDTH;
        const partnerBWidth = partnerBNode?.subtreeWidth ?? NODE_WIDTH;

        if (mNode.childIds.length === 0) {
          // 子なし婚姻: partnerA と partnerB を横に並べ、婚姻ノードを中央に
          const paX = curX + partnerAWidth / 2;
          const pbX = curX + partnerAWidth + NODE_H_GAP + partnerBWidth / 2;
          const mNodeX = (paX + pbX) / 2;

          if (firstPartnerAX === null) {
            firstPartnerAX = paX;
          }

          mNode.x = mNodeX;
          if (partnerBNode && !placed.has(mNode.partnerBId)) {
            partnerBNode.x = pbX;
            placed.add(mNode.partnerBId);
            genNextX.set(
              partnerBNode.generation,
              Math.max(genNextX.get(partnerBNode.generation) ?? 0, pbX + partnerBWidth / 2 + NODE_H_GAP)
            );
          }

          curX += partnerAWidth + NODE_H_GAP + partnerBWidth + NODE_H_GAP;
        } else {
          // 子あり: 子グループの中央に婚姻ノードを配置し、両配偶者をその横に

          // 子の合計幅
          let childTotalWidth = 0;
          for (const cid of mNode.childIds) {
            const cNode = personNodeMap.get(cid)!;
            childTotalWidth += cNode.subtreeWidth + NODE_H_GAP;
          }
          childTotalWidth -= NODE_H_GAP;

          const marriageGroupWidth = Math.max(
            partnerAWidth + NODE_H_GAP + partnerBWidth,
            childTotalWidth
          );

          const groupCenter = curX + marriageGroupWidth / 2;

          // 子を配置 (groupCenter を中心に)
          let childCurX = curX + (marriageGroupWidth - childTotalWidth) / 2;
          for (const cid of mNode.childIds) {
            const cNode = personNodeMap.get(cid)!;
            placePerson(cid, childCurX + cNode.subtreeWidth / 2);
            childCurX += cNode.subtreeWidth + NODE_H_GAP;
          }

          // 婚姻ノードを子の中央に
          mNode.x = groupCenter;

          // partnerA と partnerB を婚姻ノードの左右に配置
          const coupleWidth = partnerAWidth + NODE_H_GAP + partnerBWidth;
          const coupleStartX = groupCenter - coupleWidth / 2;
          const paX = coupleStartX + partnerAWidth / 2;
          const pbX = coupleStartX + partnerAWidth + NODE_H_GAP + partnerBWidth / 2;

          if (firstPartnerAX === null) {
            firstPartnerAX = paX;
          }

          if (partnerBNode && !placed.has(mNode.partnerBId)) {
            partnerBNode.x = pbX;
            placed.add(mNode.partnerBId);
            genNextX.set(
              partnerBNode.generation,
              Math.max(genNextX.get(partnerBNode.generation) ?? 0, pbX + partnerBWidth / 2 + NODE_H_GAP)
            );
          }

          curX += marriageGroupWidth + NODE_H_GAP;
        }
      }

      // partnerA (この person) の X を確定
      pNode.x = firstPartnerAX ?? groupStartX + NODE_WIDTH / 2;
      placed.add(personId);
      genNextX.set(gen, Math.max(nextX, pNode.x + NODE_WIDTH / 2 + NODE_H_GAP));
    }
  }

  // ルートから配置開始
  for (const rootId of roots) {
    placePerson(rootId, null);
  }
}

/**
 * personId が partnerA として担当する婚姻ノードを、
 * 婚姻開始年昇順で返す。
 */
function getOwnMarriageNodes(
  personId: string,
  marriageNodeMap: Map<string, InternalMarriageNode>
): InternalMarriageNode[] {
  const result: InternalMarriageNode[] = [];
  for (const [, m] of marriageNodeMap) {
    if (m.partnerAId === personId) {
      result.push(m);
    }
  }
  return result.sort((a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity));
}


