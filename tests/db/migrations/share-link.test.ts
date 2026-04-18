/**
 * share_link テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000011_create_share_link.sql
 *
 * テスト観点:
 * - [正常系] tree owner が自分の tree に share_link INSERT / SELECT / UPDATE / DELETE 可能
 * - [異常系] token UNIQUE 制約（同じ token で INSERT 失敗=23505）
 * - [異常系] tree_id UNIQUE 制約（同じ tree に2つの share_link INSERT 失敗=23505）
 * - [正常系] is_enabled デフォルト true
 * - [正常系] revoked_at NULL 許容
 * - [異常系] 他人の tree の share_link は SELECT できない
 * - [異常系] anon は share_link を SELECT できない
 * - [異常系] 他人の tree_id を指定して share_link INSERT 失敗
 * - [異常系] 他人の share_link への UPDATE は data=[] + adminClient 二重確認
 * - [異常系] 他人の share_link への DELETE は data=[] + adminClient 存在確認
 * - [正常系] tree 削除で share_link も CASCADE 削除
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('share_link テーブル', () => {
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
  // ヘルパー: owner のユーザーと tree を作成して返す
  // ---------------------------------------------------------------------------
  async function setupOwnerAndTree(suffix: string) {
    const email = `test-sl-${suffix}-${Date.now()}@example.com`;
    const userId = await createTestUser(email, 'Password123!');
    createdUserIds.push(userId);

    const { data: tree } = await adminClient
      .from('tree')
      .insert({ owner_user_id: userId, title: 'テスト家系図' })
      .select()
      .single();

    return { email, userId, tree: tree! };
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: ユニークなトークンを生成する
  // ---------------------------------------------------------------------------
  function generateToken(suffix: string = '') {
    return `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
  }

  // ---------------------------------------------------------------------------
  // ヘルパー: share_link を adminClient で作成して返す
  // ---------------------------------------------------------------------------
  async function createShareLink(treeId: string, token?: string) {
    const { data } = await adminClient
      .from('share_link')
      .insert({ tree_id: treeId, token: token ?? generateToken() })
      .select()
      .single();
    return data!;
  }

  // ---------------------------------------------------------------------------
  // 正常系: CRUD 操作
  // ---------------------------------------------------------------------------
  describe('CRUD: 自分の tree への操作', () => {
    it('[正常系] tree owner が share_link を INSERT できる', async () => {
      const { email, tree } = await setupOwnerAndTree('insert');

      const token = generateToken();
      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('share_link')
        .insert({ tree_id: tree.id, token })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.tree_id).toBe(tree.id);
      expect(data!.token).toBe(token);
      expect(data!.is_enabled).toBe(true); // デフォルト true
    });

    it('[正常系] tree owner が share_link を SELECT できる', async () => {
      const { email, tree } = await setupOwnerAndTree('select');

      const shareLink = await createShareLink(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('share_link')
        .select('*')
        .eq('id', shareLink.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(shareLink.id);
    });

    it('[正常系] tree owner が share_link を UPDATE できる', async () => {
      const { email, tree } = await setupOwnerAndTree('update');

      const shareLink = await createShareLink(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('share_link')
        .update({ is_enabled: false })
        .eq('id', shareLink.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('share_link')
        .select('is_enabled')
        .eq('id', shareLink.id)
        .single();
      expect(after!.is_enabled).toBe(false);
    });

    it('[正常系] tree owner が share_link を DELETE できる', async () => {
      const { email, tree } = await setupOwnerAndTree('delete');

      const shareLink = await createShareLink(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('share_link')
        .delete()
        .eq('id', shareLink.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { data: after } = await adminClient
        .from('share_link')
        .select('id')
        .eq('id', shareLink.id);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: デフォルト値・NULL 許容
  // ---------------------------------------------------------------------------
  describe('デフォルト値・NULL 許容', () => {
    it('[正常系] is_enabled のデフォルト値は true', async () => {
      const { tree } = await setupOwnerAndTree('is-enabled-default');

      const shareLink = await createShareLink(tree.id);

      expect(shareLink.is_enabled).toBe(true);
    });

    it('[正常系] revoked_at は NULL 許容', async () => {
      const { tree } = await setupOwnerAndTree('revoked-at-null');

      const shareLink = await createShareLink(tree.id);

      expect(shareLink.revoked_at).toBeNull();
    });

    it('[正常系] revoked_at に値を設定できる', async () => {
      const { tree } = await setupOwnerAndTree('revoked-at-set');

      const revokedAt = new Date().toISOString();
      const { data } = await adminClient
        .from('share_link')
        .insert({ tree_id: tree.id, token: generateToken(), revoked_at: revokedAt })
        .select()
        .single();

      expect(data!.revoked_at).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: UNIQUE 制約
  // ---------------------------------------------------------------------------
  describe('UNIQUE 制約', () => {
    it('[異常系] 同じ token で2回 INSERT すると UNIQUE 違反（23505）', async () => {
      const { tree: treeA } = await setupOwnerAndTree('unique-token-a');

      const emailB = `test-sl-unique-token-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: treeB } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdB, title: 'ユーザーBの家系図' })
        .select()
        .single();

      const sameToken = generateToken('-same');

      // 1つ目の share_link（tree_id: treeA）
      await adminClient
        .from('share_link')
        .insert({ tree_id: treeA.id, token: sameToken });

      // 同じ token で2つ目の share_link（tree_id: treeB）
      const { error } = await adminClient
        .from('share_link')
        .insert({ tree_id: treeB!.id, token: sameToken });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });

    it('[異常系] 同じ tree_id に2つの share_link を INSERT すると UNIQUE 違反（23505）', async () => {
      const { tree } = await setupOwnerAndTree('unique-treeid');

      // 1つ目の share_link
      await createShareLink(tree.id);

      // 同じ tree_id で2つ目の share_link
      const { error } = await adminClient
        .from('share_link')
        .insert({ tree_id: tree.id, token: generateToken('-second') });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - アクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: アクセス制御', () => {
    it('[異常系] anon ユーザーは share_link を SELECT できない', async () => {
      const { tree } = await setupOwnerAndTree('rls-anon');

      const shareLink = await createShareLink(tree.id);

      const { data, error } = await anonClient
        .from('share_link')
        .select('*')
        .eq('id', shareLink.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] anon ユーザーは share_link を INSERT できない', async () => {
      const { tree } = await setupOwnerAndTree('rls-anon-insert');

      const { error } = await anonClient
        .from('share_link')
        .insert({ tree_id: tree.id, token: generateToken('-anon') });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の tree の share_link は SELECT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-select-a');

      const emailB = `test-sl-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const shareLink = await createShareLink(treeA.id);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('share_link')
        .select('*')
        .eq('id', shareLink.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree_id を指定して share_link を INSERT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-insert-a');

      const emailB = `test-sl-rls-insert-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('share_link')
        .insert({ tree_id: treeA.id, token: generateToken('-malicious') });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の share_link への UPDATE は data=[] + adminClient で未変更確認', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-update-a');

      const emailB = `test-sl-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const shareLink = await createShareLink(treeA.id);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('share_link')
        .update({ is_enabled: false })
        .eq('id', shareLink.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // adminClient で実際の値が変更されていないことを確認
      const { data: check } = await adminClient
        .from('share_link')
        .select('is_enabled')
        .eq('id', shareLink.id)
        .single();
      expect(check!.is_enabled).toBe(true); // 変更されていない
    });

    it('[異常系] 他人の share_link への DELETE は data=[] + adminClient で存在確認', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-delete-a');

      const emailB = `test-sl-rls-delete-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const shareLink = await createShareLink(treeA.id);

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('share_link')
        .delete()
        .eq('id', shareLink.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // adminClient で行が削除されていないことを確認
      const { data: check } = await adminClient
        .from('share_link')
        .select('id')
        .eq('id', shareLink.id);
      expect(check).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] tree を削除すると share_link も CASCADE 削除される', async () => {
      const { tree } = await setupOwnerAndTree('cascade-tree');

      const shareLink = await createShareLink(tree.id);

      // share_link が存在することを確認
      const { data: before } = await adminClient
        .from('share_link')
        .select('id')
        .eq('id', shareLink.id);
      expect(before).toHaveLength(1);

      await adminClient.from('tree').delete().eq('id', tree.id);

      const { data: after } = await adminClient
        .from('share_link')
        .select('id')
        .eq('id', shareLink.id);
      expect(after).toHaveLength(0);
    });
  });
});
