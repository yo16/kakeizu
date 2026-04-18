/**
 * relation テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000008_create_relation.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] parent_child / marriage のそれぞれで正常にINSERT
 * - [異常系] kind が許可外で失敗
 * - [異常系] parent_role / marriage_type / marriage_status の各値が許可外で失敗
 * - [異常系] 自己参照（from = to）で失敗
 * - [異常系] kind='parent_child' なのに marriage_type を入れると失敗
 * - [異常系] kind='marriage' なのに parent_role を入れると失敗
 * - [異常系] parent_child の UNIQUE: 同じ (from, to, parent_role) で2回INSERTすると失敗
 * - [正常系] parent_child: 同じ (from, to) で異なる parent_role なら2行共存可能
 * - [異常系] marriage の UNIQUE: 同じペアを (A,B) と (B,A) で登録すると失敗
 * - [正常系] marriage: 異なる marriage_type なら同じペアで複数登録可能
 * - [異常系] tree owner でない他人の tree_id を指定して relation INSERT は失敗
 * - [正常系] person 削除で relation が CASCADE 削除
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('relation テーブル', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => {
        // 既に削除済みの場合は無視
      });
    }
    createdUserIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // ヘルパー: owner のユーザー・tree・person2人を作成して返す
  // ---------------------------------------------------------------------------
  async function setupOwnerTreeAndPersons(suffix: string) {
    const email = `test-relation-${suffix}-${Date.now()}@example.com`;
    const userId = await createTestUser(email, 'Password123!');
    createdUserIds.push(userId);

    const { data: tree } = await adminClient
      .from('tree')
      .insert({ owner_user_id: userId, title: 'テスト家系図' })
      .select()
      .single();

    const { data: personA } = await adminClient
      .from('person')
      .insert({ tree_id: tree!.id, display_name: '人物A' })
      .select()
      .single();

    const { data: personB } = await adminClient
      .from('person')
      .insert({ tree_id: tree!.id, display_name: '人物B' })
      .select()
      .single();

    return { email, userId, tree: tree!, personA: personA!, personB: personB! };
  }

  // ---------------------------------------------------------------------------
  // 正常系: INSERT
  // ---------------------------------------------------------------------------
  describe('正常系: INSERT', () => {
    it('[正常系] kind=parent_child で正常にINSERTできる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('insert-parent-child');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.kind).toBe('parent_child');
      expect(data!.parent_role).toBe('biological');
    });

    it('[正常系] kind=marriage で正常にINSERTできる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('insert-marriage');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
          marriage_status: 'current',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.kind).toBe('marriage');
      expect(data!.marriage_type).toBe('spouse');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: kind CHECK 制約
  // ---------------------------------------------------------------------------
  describe('kind CHECK 制約', () => {
    it('[異常系] kind が許可外の値で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('kind-invalid');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'invalid',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        });

      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: 各フィールドの CHECK 制約
  // ---------------------------------------------------------------------------
  describe('parent_role / marriage_type / marriage_status の CHECK 制約', () => {
    it('[異常系] parent_role が許可外の値で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-role-invalid');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'invalid_role',
        });

      expect(error).not.toBeNull();
    });

    it('[正常系] parent_role に biological を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-role-bio');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.parent_role).toBe('biological');
    });

    it('[正常系] parent_role に adoptive を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-role-adoptive');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'adoptive',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.parent_role).toBe('adoptive');
    });

    it('[正常系] parent_role に step を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-role-step');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'step',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.parent_role).toBe('step');
    });

    it('[異常系] marriage_type が許可外の値で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-type-invalid');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'invalid_type',
        });

      expect(error).not.toBeNull();
    });

    it('[正常系] marriage_type に common_law を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-type-common-law');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'common_law',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.marriage_type).toBe('common_law');
    });

    it('[正常系] marriage_type に same_sex_partner を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-type-same-sex');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'same_sex_partner',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.marriage_type).toBe('same_sex_partner');
    });

    it('[異常系] marriage_status が許可外の値で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-status-invalid');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
          marriage_status: 'invalid_status',
        });

      expect(error).not.toBeNull();
    });

    it('[正常系] marriage_status に divorced を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-status-divorced');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
          marriage_status: 'divorced',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.marriage_status).toBe('divorced');
    });

    it('[正常系] marriage_status に widowed を指定して INSERT できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-status-widowed');

      const { data, error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
          marriage_status: 'widowed',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.marriage_status).toBe('widowed');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: 自己参照禁止
  // ---------------------------------------------------------------------------
  describe('自己参照禁止 (chk_relation_no_self_ref)', () => {
    it('[異常系] from_person_id と to_person_id が同じ場合に INSERT に失敗する', async () => {
      const { tree, personA } = await setupOwnerTreeAndPersons('self-ref');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personA.id,
          parent_role: 'biological',
        });

      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: kind とフィールドの組み合わせ CHECK 制約
  // ---------------------------------------------------------------------------
  describe('kind とフィールドの整合性 CHECK 制約', () => {
    it('[異常系] kind=parent_child なのに marriage_type を入れると INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-child-with-marriage-type');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
          marriage_type: 'spouse',
        });

      expect(error).not.toBeNull();
    });

    it('[異常系] kind=parent_child なのに marriage_status を入れると INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-child-with-marriage-status');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
          marriage_status: 'current',
        });

      expect(error).not.toBeNull();
    });

    it('[異常系] kind=parent_child なのに parent_role が NULL で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('parent-child-null-role');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: null,
        });

      expect(error).not.toBeNull();
    });

    it('[異常系] kind=marriage なのに parent_role を入れると INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-with-parent-role');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
          parent_role: 'biological',
        });

      expect(error).not.toBeNull();
    });

    it('[異常系] kind=marriage なのに marriage_type が NULL で INSERT に失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('marriage-null-type');

      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: null,
        });

      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: UNIQUE インデックス (parent_child)
  // ---------------------------------------------------------------------------
  describe('UNIQUE インデックス: parent_child', () => {
    it('[異常系] 同じ (from, to, parent_role) の parent_child を2回INSERTすると失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('unique-parent-child');

      await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        });

      // 同じ組み合わせを再INSERT
      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });

    it('[正常系] 同じ (from, to) で異なる parent_role なら2行共存できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('unique-parent-child-diff-role');

      const { error: err1 } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        });

      const { error: err2 } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'adoptive',
        });

      expect(err1).toBeNull();
      expect(err2).toBeNull();

      // 2行存在することを確認
      const { data } = await adminClient
        .from('relation')
        .select('parent_role')
        .eq('from_person_id', personA.id)
        .eq('to_person_id', personB.id)
        .eq('kind', 'parent_child');
      expect(data).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: UNIQUE インデックス (marriage - LEAST/GREATEST)
  // ---------------------------------------------------------------------------
  describe('UNIQUE インデックス: marriage (LEAST/GREATEST によるペア順序非依存)', () => {
    it('[異常系] (A→B, spouse) を登録後、(B→A, spouse) を登録すると失敗する', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('unique-marriage-reverse');

      // A→B で登録
      await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
        });

      // B→A で同じ marriage_type を登録（UNIQUE 違反になるはず）
      const { error } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personB.id,
          to_person_id: personA.id,
          marriage_type: 'spouse',
        });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });

    it('[正常系] 異なる marriage_type なら同じペアで複数登録できる', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('unique-marriage-diff-type');

      const { error: err1 } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
        });

      const { error: err2 } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'common_law',
        });

      expect(err1).toBeNull();
      expect(err2).toBeNull();

      // 2行存在することを確認
      const { data } = await adminClient
        .from('relation')
        .select('marriage_type')
        .eq('from_person_id', personA.id)
        .eq('to_person_id', personB.id)
        .eq('kind', 'marriage');
      expect(data).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の tree_id を指定した INSERT
  // ---------------------------------------------------------------------------
  describe('RLS: 他人の tree_id を指定した INSERT', () => {
    it('[異常系] tree owner でないユーザーが他人の tree_id で relation INSERT できない', async () => {
      // ユーザーA の tree と person を作成
      const { tree: treeA, personA, personB } = await setupOwnerTreeAndPersons('rls-insert-other-tree-a');

      // ユーザーB を作成
      const emailB = `test-relation-rls-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB としてユーザーA の tree_id を使って INSERT
      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('relation')
        .insert({
          tree_id: treeA.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        });

      // INSERT の RLS 拒否はエラーになる
      expect(error).not.toBeNull();
    });

    it('[異常系] anon ユーザーは relation を SELECT できない', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('rls-anon-select');

      const { data: rel } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        })
        .select()
        .single();

      const { data, error } = await anonClient
        .from('relation')
        .select('*')
        .eq('id', rel!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree 配下の relation は SELECT できない', async () => {
      const { tree: treeA, personA, personB } = await setupOwnerTreeAndPersons('rls-select-other-a');

      const emailB = `test-relation-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: rel } = await adminClient
        .from('relation')
        .insert({
          tree_id: treeA.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('relation')
        .select('*')
        .eq('id', rel!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] person を削除すると relation も CASCADE 削除される', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('cascade-person');

      const { data: rel } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'parent_child',
          from_person_id: personA.id,
          to_person_id: personB.id,
          parent_role: 'biological',
        })
        .select()
        .single();

      // relation が存在することを確認
      const { data: before } = await adminClient
        .from('relation')
        .select('id')
        .eq('id', rel!.id);
      expect(before).toHaveLength(1);

      // from_person_id の person を削除（CASCADE で relation も削除されるはず）
      await adminClient.from('person').delete().eq('id', personA.id);

      // relation も削除されていることを確認
      const { data: after } = await adminClient
        .from('relation')
        .select('id')
        .eq('id', rel!.id);
      expect(after).toHaveLength(0);
    });

    it('[正常系] tree を削除すると relation も CASCADE 削除される', async () => {
      const { tree, personA, personB } = await setupOwnerTreeAndPersons('cascade-tree');

      const { data: rel } = await adminClient
        .from('relation')
        .insert({
          tree_id: tree.id,
          kind: 'marriage',
          from_person_id: personA.id,
          to_person_id: personB.id,
          marriage_type: 'spouse',
        })
        .select()
        .single();

      // relation が存在することを確認
      const { data: before } = await adminClient
        .from('relation')
        .select('id')
        .eq('id', rel!.id);
      expect(before).toHaveLength(1);

      // tree を削除（CASCADE で person も relation も削除されるはず）
      await adminClient.from('tree').delete().eq('id', tree.id);

      // relation も削除されていることを確認
      const { data: after } = await adminClient
        .from('relation')
        .select('id')
        .eq('id', rel!.id);
      expect(after).toHaveLength(0);
    });
  });
});
