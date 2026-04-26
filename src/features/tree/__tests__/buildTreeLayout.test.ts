/**
 * buildTreeLayout 単体テスト
 *
 * tree-visualization-design.md §4 レイアウトアルゴリズム の受け入れ条件を網羅する。
 * 婚姻ノードを介した親子関係・再婚ケース・3世代・孤立ノード・空配列など
 * 全ケースを Jest で検証する。
 */

import { buildTreeLayout } from '../lib/buildTreeLayout';
import {
  NODE_WIDTH,
  NODE_H_GAP,
  GENERATION_GAP,
  type PersonForLayout,
  type RelationForLayout,
  type PersonNode,
  type MarriageNode,
} from '../types';

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** PersonNode だけを nodes から抽出 */
function getPersonNodes(nodes: ReturnType<typeof buildTreeLayout>['nodes']): PersonNode[] {
  return nodes.filter((n): n is PersonNode => n.type === 'person');
}

/** MarriageNode だけを nodes から抽出 */
function getMarriageNodes(nodes: ReturnType<typeof buildTreeLayout>['nodes']): MarriageNode[] {
  return nodes.filter((n): n is MarriageNode => n.type === 'marriage');
}

/**
 * 同一世代内の PersonNode 同士で x 座標の重複がないことを検証。
 * MarriageNode は配偶者2人の中央に配置される仮想ノードのため、
 * PersonNode との距離が NODE_WIDTH 未満になるのは設計通り。
 */
function assertNoXOverlapPersons(personNodes: PersonNode[]): void {
  const byGen = new Map<number, PersonNode[]>();
  for (const n of personNodes) {
    const arr = byGen.get(n.generation) ?? [];
    arr.push(n);
    byGen.set(n.generation, arr);
  }
  for (const nodes of byGen.values()) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.abs(nodes[i].x - nodes[j].x);
        expect(dist).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  }
}

/**
 * 同一世代内の MarriageNode 同士で x 座標の重複がないことを検証。
 * 再婚ケースで複数の婚姻ノードが同世代に存在する場合に意味を持つ。
 */
function assertNoXOverlapMarriages(marriageNodes: MarriageNode[]): void {
  const byGen = new Map<number, MarriageNode[]>();
  for (const n of marriageNodes) {
    const arr = byGen.get(n.generation) ?? [];
    arr.push(n);
    byGen.set(n.generation, arr);
  }
  for (const nodes of byGen.values()) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.abs(nodes[i].x - nodes[j].x);
        expect(dist).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// テストデータファクトリ
// ---------------------------------------------------------------------------

function person(id: string, birth_year: number | null = null): PersonForLayout {
  return { id, birth_year };
}

function marriageRel(
  id: string,
  fromPersonId: string,
  toPersonId: string,
  startYear: number | null = null
): RelationForLayout {
  return {
    id,
    kind: 'marriage',
    fromPersonId,
    toPersonId,
    startYear,
    marriageStatus: 'current',
    marriageType: 'spouse',
    parentRole: null,
  };
}

function parentChildRel(
  id: string,
  fromPersonId: string,
  toPersonId: string
): RelationForLayout {
  return {
    id,
    kind: 'parent_child',
    fromPersonId,
    toPersonId,
    startYear: null,
    marriageStatus: null,
    marriageType: null,
    parentRole: 'biological',
  };
}

// ===========================================================================
// テストスイート
// ===========================================================================

describe('buildTreeLayout', () => {
  // -------------------------------------------------------------------------
  // 正常系 1: 空配列
  // -------------------------------------------------------------------------
  describe('空配列', () => {
    it('persons が空のとき nodes[] / edges[] が空で返る', () => {
      const result = buildTreeLayout([], []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.totalWidth).toBe(0);
      expect(result.totalHeight).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 2: 孤立人物 1人
  // -------------------------------------------------------------------------
  describe('孤立人物 1人', () => {
    it('person が 1 人だけ → generation=0, x/y が有効な数値で返る', () => {
      const result = buildTreeLayout([person('p1')], []);
      const personNodes = getPersonNodes(result.nodes);
      expect(personNodes).toHaveLength(1);
      expect(personNodes[0].id).toBe('p1');
      expect(personNodes[0].generation).toBe(0);
      expect(typeof personNodes[0].x).toBe('number');
      expect(typeof personNodes[0].y).toBe('number');
      expect(getMarriageNodes(result.nodes)).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 3: 複数の孤立人物
  // -------------------------------------------------------------------------
  describe('複数の孤立人物', () => {
    it('関係のない person 3人 → x 座標が重複しない', () => {
      const result = buildTreeLayout(
        [person('p1'), person('p2'), person('p3')],
        []
      );
      const personNodes = getPersonNodes(result.nodes);
      expect(personNodes).toHaveLength(3);
      // 全員 generation=0
      personNodes.forEach((n) => expect(n.generation).toBe(0));
      // x 座標が全員異なる (NODE_WIDTH 以上離れている)
      assertNoXOverlapPersons(personNodes);
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 4: 標準家族 (両親 + 子 1人)
  // -------------------------------------------------------------------------
  describe('標準家族 (両親 + 子 1人)', () => {
    const persons = [person('father'), person('mother'), person('child', 2000)];
    const relations = [
      marriageRel('m1', 'father', 'mother'),
      parentChildRel('r1', 'father', 'child'),
      parentChildRel('r2', 'mother', 'child'),
    ];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('PersonNode が 3 つ、MarriageNode が 1 つ生成される', () => {
      expect(getPersonNodes(result.nodes)).toHaveLength(3);
      expect(getMarriageNodes(result.nodes)).toHaveLength(1);
    });

    it('親世代 (generation=0) の y < 子世代 (generation=1) の y', () => {
      const fatherNode = result.nodes.find((n) => n.id === 'father') as PersonNode;
      const childNode = result.nodes.find((n) => n.id === 'child') as PersonNode;
      expect(fatherNode.generation).toBe(0);
      expect(childNode.generation).toBe(1);
      expect(fatherNode.y).toBeLessThan(childNode.y);
    });

    it('婚姻ノードが父と母の x 中央付近に配置される', () => {
      const fatherNode = result.nodes.find((n) => n.id === 'father') as PersonNode;
      const motherNode = result.nodes.find((n) => n.id === 'mother') as PersonNode;
      const marriageNode = getMarriageNodes(result.nodes)[0];
      const midX = (fatherNode.x + motherNode.x) / 2;
      // 誤差 NODE_WIDTH 以内
      expect(Math.abs(marriageNode.x - midX)).toBeLessThanOrEqual(NODE_WIDTH);
    });

    it('子は婚姻ノードの x 付近に配置される', () => {
      const marriageNode = getMarriageNodes(result.nodes)[0];
      const childNode = result.nodes.find((n) => n.id === 'child') as PersonNode;
      // 子が婚姻ノードの中心から NODE_WIDTH * 1.5 以内
      expect(Math.abs(childNode.x - marriageNode.x)).toBeLessThanOrEqual(NODE_WIDTH * 1.5);
    });

    it('エッジが 4 本生成される (marriage_line x2 + parent_child_line x2)', () => {
      // marriageノード→fatherA, fatherB, child
      // marriage: partnerA→mNode, partnerB→mNode = 2本
      // parent_child: mNode→child = 1本
      // 合計 3 本
      const marriageLines = result.edges.filter((e) => e.kind === 'marriage_line');
      const parentChildLines = result.edges.filter((e) => e.kind === 'parent_child_line');
      expect(marriageLines).toHaveLength(2);
      expect(parentChildLines).toHaveLength(1);
    });

    it('PersonNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapPersons(getPersonNodes(result.nodes));
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 5: 両親 + 複数の子 (3人)
  // -------------------------------------------------------------------------
  describe('両親 + 複数の子 (3人)', () => {
    const persons = [
      person('father'),
      person('mother'),
      person('child1', 2000),
      person('child2', 2002),
      person('child3', 1998),
    ];
    const relations = [
      marriageRel('m1', 'father', 'mother'),
      parentChildRel('r1', 'father', 'child1'),
      parentChildRel('r2', 'mother', 'child1'),
      parentChildRel('r3', 'father', 'child2'),
      parentChildRel('r4', 'mother', 'child2'),
      parentChildRel('r5', 'father', 'child3'),
      parentChildRel('r6', 'mother', 'child3'),
    ];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('子 3 人が全員 generation=1', () => {
      const children = ['child1', 'child2', 'child3'].map(
        (id) => result.nodes.find((n) => n.id === id) as PersonNode
      );
      children.forEach((c) => expect(c.generation).toBe(1));
    });

    it('子の x 座標が全て異なる (重複なし)', () => {
      const children = ['child1', 'child2', 'child3'].map(
        (id) => result.nodes.find((n) => n.id === id) as PersonNode
      );
      const xs = children.map((c) => c.x);
      // 全ての x 座標の差が 0 より大きい
      for (let i = 0; i < xs.length; i++) {
        for (let j = i + 1; j < xs.length; j++) {
          expect(Math.abs(xs[i] - xs[j])).toBeGreaterThan(0);
        }
      }
    });

    it('PersonNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapPersons(getPersonNodes(result.nodes));
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 6: 3世代家族
  // -------------------------------------------------------------------------
  describe('3世代家族 (祖父母 → 父 → 孫)', () => {
    const persons = [
      person('grandpa'),
      person('grandma'),
      person('father'),
      person('mother'),
      person('child', 2010),
    ];
    const relations = [
      marriageRel('m1', 'grandpa', 'grandma'),
      parentChildRel('r1', 'grandpa', 'father'),
      parentChildRel('r2', 'grandma', 'father'),
      marriageRel('m2', 'father', 'mother'),
      parentChildRel('r3', 'father', 'child'),
      parentChildRel('r4', 'mother', 'child'),
    ];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('generation: grandpa/grandma=0, father/mother=1, child=2', () => {
      const getGen = (id: string) =>
        (result.nodes.find((n) => n.id === id) as PersonNode).generation;
      expect(getGen('grandpa')).toBe(0);
      expect(getGen('grandma')).toBe(0);
      expect(getGen('father')).toBe(1);
      expect(getGen('mother')).toBe(1);
      expect(getGen('child')).toBe(2);
    });

    it('MarriageNode が 2 つ生成される', () => {
      expect(getMarriageNodes(result.nodes)).toHaveLength(2);
    });

    it('y 座標: 祖父母 < 父母 < 孫', () => {
      const grandpaY = (result.nodes.find((n) => n.id === 'grandpa') as PersonNode).y;
      const fatherY = (result.nodes.find((n) => n.id === 'father') as PersonNode).y;
      const childY = (result.nodes.find((n) => n.id === 'child') as PersonNode).y;
      expect(grandpaY).toBeLessThan(fatherY);
      expect(fatherY).toBeLessThan(childY);
    });

    it('PersonNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapPersons(getPersonNodes(result.nodes));
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 7: 再婚 (partnerA が 2 回婚姻)
  // -------------------------------------------------------------------------
  describe('再婚: 父が母A・母Bと2回婚姻', () => {
    const persons = [
      person('father'),
      person('motherA'),
      person('motherB'),
      person('childA', 2000),
      person('childB', 2005),
    ];
    const relations = [
      marriageRel('m1', 'father', 'motherA', 1998),
      marriageRel('m2', 'father', 'motherB', 2003),
      parentChildRel('r1', 'father', 'childA'),
      parentChildRel('r2', 'motherA', 'childA'),
      parentChildRel('r3', 'father', 'childB'),
      parentChildRel('r4', 'motherB', 'childB'),
    ];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('MarriageNode が 2 つ生成される', () => {
      expect(getMarriageNodes(result.nodes)).toHaveLength(2);
    });

    it('2 つの婚姻ノードの x 座標が重複しない', () => {
      const mNodes = getMarriageNodes(result.nodes);
      expect(mNodes).toHaveLength(2);
      const [m1, m2] = mNodes;
      expect(Math.abs(m1.x - m2.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
    });

    it('PersonNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapPersons(getPersonNodes(result.nodes));
    });

    it('MarriageNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapMarriages(getMarriageNodes(result.nodes));
    });

    it('childA と childB の x 座標が異なる', () => {
      const childANode = result.nodes.find((n) => n.id === 'childA') as PersonNode;
      const childBNode = result.nodes.find((n) => n.id === 'childB') as PersonNode;
      expect(Math.abs(childANode.x - childBNode.x)).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 8: 婚姻ノードのみ (子なし)
  // -------------------------------------------------------------------------
  describe('婚姻ノードのみ (子なし)', () => {
    const persons = [person('partnerA'), person('partnerB')];
    const relations = [marriageRel('m1', 'partnerA', 'partnerB')];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('PersonNode 2 つ、MarriageNode 1 つが生成される', () => {
      expect(getPersonNodes(result.nodes)).toHaveLength(2);
      expect(getMarriageNodes(result.nodes)).toHaveLength(1);
    });

    it('marriage_line エッジが 2 本、parent_child_line が 0 本', () => {
      expect(result.edges.filter((e) => e.kind === 'marriage_line')).toHaveLength(2);
      expect(result.edges.filter((e) => e.kind === 'parent_child_line')).toHaveLength(0);
    });

    it('PersonNode 同士の x 座標が重複しない', () => {
      assertNoXOverlapPersons(getPersonNodes(result.nodes));
    });
  });

  // -------------------------------------------------------------------------
  // 正常系 9: 生年なしの兄弟
  // -------------------------------------------------------------------------
  describe('生年なしの兄弟', () => {
    it('生年 null の子は生年あり兄弟より右側 (末尾) に配置される', () => {
      const persons = [
        person('father'),
        person('mother'),
        person('child_no_birth', null),  // 生年なし
        person('child_2000', 2000),       // 生年あり
      ];
      const relations = [
        marriageRel('m1', 'father', 'mother'),
        parentChildRel('r1', 'father', 'child_no_birth'),
        parentChildRel('r2', 'mother', 'child_no_birth'),
        parentChildRel('r3', 'father', 'child_2000'),
        parentChildRel('r4', 'mother', 'child_2000'),
      ];

      const result = buildTreeLayout(persons, relations);
      const childNoBirth = result.nodes.find((n) => n.id === 'child_no_birth') as PersonNode;
      const child2000 = result.nodes.find((n) => n.id === 'child_2000') as PersonNode;

      // 生年あり (2000) < 生年なし (末尾 → x が大きい)
      expect(child2000.x).toBeLessThan(childNoBirth.x);
    });
  });

  // -------------------------------------------------------------------------
  // エッジケース 10: 片親のみ (parent_child のみ、marriage なし)
  // -------------------------------------------------------------------------
  describe('片親のみ (婚姻なし)', () => {
    const persons = [person('parent'), person('child', 2000)];
    const relations = [parentChildRel('r1', 'parent', 'child')];

    let result: ReturnType<typeof buildTreeLayout>;
    beforeEach(() => {
      result = buildTreeLayout(persons, relations);
    });

    it('MarriageNode が生成されない', () => {
      expect(getMarriageNodes(result.nodes)).toHaveLength(0);
    });

    it('parent → child の parent_child_line エッジが 1 本', () => {
      const edges = result.edges.filter((e) => e.kind === 'parent_child_line');
      expect(edges).toHaveLength(1);
      expect(edges[0].fromId).toBe('parent');
      expect(edges[0].toId).toBe('child');
    });

    it('parent が generation=0, child が generation=1', () => {
      const parentNode = result.nodes.find((n) => n.id === 'parent') as PersonNode;
      const childNode = result.nodes.find((n) => n.id === 'child') as PersonNode;
      expect(parentNode.generation).toBe(0);
      expect(childNode.generation).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // エッジケース 11: 婚姻のみ (parent_child なし)
  // -------------------------------------------------------------------------
  describe('婚姻のみ (子なし)', () => {
    it('marriage relation だけがある場合、MarriageNode が 1 つ生成され子エッジなし', () => {
      const persons = [person('pA'), person('pB')];
      const relations = [marriageRel('m1', 'pA', 'pB')];
      const result = buildTreeLayout(persons, relations);

      expect(getMarriageNodes(result.nodes)).toHaveLength(1);
      expect(result.edges.filter((e) => e.kind === 'parent_child_line')).toHaveLength(0);
      expect(result.edges.filter((e) => e.kind === 'marriage_line')).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // エッジケース 12: データ不整合 (存在しない personId を参照する relation)
  // -------------------------------------------------------------------------
  describe('データ不整合: 存在しない personId 参照', () => {
    it('存在しない person を参照する parent_child relation があっても例外を投げない', () => {
      const persons = [person('real_parent')];
      const relations = [
        // 'ghost_child' は persons に存在しない
        parentChildRel('r1', 'real_parent', 'ghost_child'),
      ];

      expect(() => buildTreeLayout(persons, relations)).not.toThrow();
    });

    it('存在しない person を参照する marriage relation があっても例外を投げない', () => {
      const persons = [person('pA')];
      const relations = [
        // 'ghost_person' は persons に存在しない
        marriageRel('m1', 'pA', 'ghost_person'),
      ];

      expect(() => buildTreeLayout(persons, relations)).not.toThrow();
    });

    it('存在しない person を参照する relation でも、存在する person のノードは返る', () => {
      const persons = [person('real_person')];
      const relations = [parentChildRel('r1', 'real_person', 'ghost_child')];

      const result = buildTreeLayout(persons, relations);
      const personNodes = getPersonNodes(result.nodes);
      expect(personNodes.some((n) => n.id === 'real_person')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 定数・Y座標の検証
  // -------------------------------------------------------------------------
  describe('Y 座標の計算', () => {
    it('generation=0 の PersonNode の y = 0 * GENERATION_GAP', () => {
      const result = buildTreeLayout([person('p1')], []);
      const pNode = result.nodes.find((n) => n.id === 'p1') as PersonNode;
      expect(pNode.y).toBe(0 * GENERATION_GAP);
    });

    it('generation=1 の PersonNode の y = 1 * GENERATION_GAP', () => {
      const persons = [person('parent'), person('child')];
      const relations = [parentChildRel('r1', 'parent', 'child')];
      const result = buildTreeLayout(persons, relations);
      const childNode = result.nodes.find((n) => n.id === 'child') as PersonNode;
      expect(childNode.y).toBe(1 * GENERATION_GAP);
    });

    it('MarriageNode の y = (generation + 0.5) * GENERATION_GAP', () => {
      const persons = [person('pA'), person('pB')];
      const relations = [marriageRel('m1', 'pA', 'pB')];
      const result = buildTreeLayout(persons, relations);
      const mNode = getMarriageNodes(result.nodes)[0];
      expect(mNode.y).toBe((mNode.generation + 0.5) * GENERATION_GAP);
    });
  });

  // -------------------------------------------------------------------------
  // エッジ接続の検証
  // -------------------------------------------------------------------------
  describe('エッジ接続の検証', () => {
    it('marriage_line エッジの fromId が PersonNode の id を参照する', () => {
      const persons = [person('pA'), person('pB')];
      const relations = [marriageRel('m1', 'pA', 'pB')];
      const result = buildTreeLayout(persons, relations);
      const personIds = new Set(getPersonNodes(result.nodes).map((n) => n.id));

      result.edges
        .filter((e) => e.kind === 'marriage_line')
        .forEach((e) => {
          expect(personIds.has(e.fromId)).toBe(true);
        });
    });

    it('marriage_line エッジの toId が MarriageNode の id を参照する', () => {
      const persons = [person('pA'), person('pB')];
      const relations = [marriageRel('m1', 'pA', 'pB')];
      const result = buildTreeLayout(persons, relations);
      const marriageIds = new Set(getMarriageNodes(result.nodes).map((n) => n.id));

      result.edges
        .filter((e) => e.kind === 'marriage_line')
        .forEach((e) => {
          expect(marriageIds.has(e.toId)).toBe(true);
        });
    });

    it('parent_child_line の fromId が MarriageNode (両親あり) を参照する', () => {
      const persons = [person('father'), person('mother'), person('child', 2000)];
      const relations = [
        marriageRel('m1', 'father', 'mother'),
        parentChildRel('r1', 'father', 'child'),
        parentChildRel('r2', 'mother', 'child'),
      ];
      const result = buildTreeLayout(persons, relations);
      const marriageIds = new Set(getMarriageNodes(result.nodes).map((n) => n.id));

      const pcEdges = result.edges.filter((e) => e.kind === 'parent_child_line');
      expect(pcEdges).toHaveLength(1);
      expect(marriageIds.has(pcEdges[0].fromId)).toBe(true);
      expect(pcEdges[0].toId).toBe('child');
    });
  });
});
