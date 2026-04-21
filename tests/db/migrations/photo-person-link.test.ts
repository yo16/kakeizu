/**
 * photo_person_link テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000010_create_photo_person_link.sql
 *
 * テスト観点:
 * - [正常系] 同じ tree 配下の photo と person を link（INSERT）可能
 * - [正常系] link を DELETE 可能
 * - [正常系] 複合PK (photo_id, person_id) が機能（同じペアで2回INSERT失敗=23505、異なるペアは共存）
 * - [正常系] photo 削除で link も CASCADE 削除
 * - [正常系] person 削除で link も CASCADE 削除
 * - [異常系] anon は photo_person_link を SELECT できない
 * - [異常系] anon は photo_person_link を INSERT できない
 * - [異常系] 他人の tree 配下の photo と person への link は INSERT できない
 * - [異常系] 他人の photo 配下の link への DELETE は 0 rows affected
 * - [設計意図] クロスツリー（自分の photo + 他人の person）での link INSERT は許容される（photo 側 RLS のみ）
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('photo_person_link テーブル', () => {
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
    const email = `test-ppl-${suffix}-${Date.now()}@example.com`;
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
  // ヘルパー: photo と person を adminClient で作成して返す
  // ---------------------------------------------------------------------------
  async function createPhoto(treeId: string) {
    const { data } = await adminClient
      .from('photo')
      .insert({
        tree_id: treeId,
        storage_object_key: `photos/${Date.now()}.jpg`,
        mime_type: 'image/jpeg',
      })
      .select()
      .single();
    return data!;
  }

  async function createPerson(treeId: string, displayName: string = 'テスト人物') {
    const { data } = await adminClient
      .from('person')
      .insert({ tree_id: treeId, display_name: displayName })
      .select()
      .single();
    return data!;
  }

  // ---------------------------------------------------------------------------
  // 正常系: CRUD 操作
  // ---------------------------------------------------------------------------
  describe('CRUD: 自分の tree 配下での操作', () => {
    it('[正常系] 同じ tree 配下の photo と person を link（INSERT）できる', async () => {
      const { email, tree } = await setupOwnerAndTree('insert');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.photo_id).toBe(photo.id);
      expect(data!.person_id).toBe(person.id);
    });

    it('[正常系] tree owner が link を DELETE できる', async () => {
      const { email, tree } = await setupOwnerAndTree('delete');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo_person_link')
        .delete()
        .eq('photo_id', photo.id)
        .eq('person_id', person.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { data: after } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id)
        .eq('person_id', person.id);
      expect(after).toHaveLength(0);
    });

    it('[正常系] tree owner が link を SELECT できる', async () => {
      const { email, tree } = await setupOwnerAndTree('select');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].person_id).toBe(person.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系・異常系: 複合 PK
  // ---------------------------------------------------------------------------
  describe('複合 PK (photo_id, person_id)', () => {
    it('[異常系] 同じ (photo_id, person_id) ペアで2回 INSERT すると UNIQUE 違反（23505）', async () => {
      const { tree } = await setupOwnerAndTree('pk-dup');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      const { error } = await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505'); // unique_violation
    });

    it('[正常系] 同じ photo に異なる person をリンクして共存できる', async () => {
      const { tree } = await setupOwnerAndTree('pk-multi');

      const photo = await createPhoto(tree.id);
      const person1 = await createPerson(tree.id, '人物1');
      const person2 = await createPerson(tree.id, '人物2');

      const { error: err1 } = await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person1.id });

      const { error: err2 } = await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person2.id });

      expect(err1).toBeNull();
      expect(err2).toBeNull();

      const { data } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);
      expect(data).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] photo を削除すると photo_person_link も CASCADE 削除される', async () => {
      const { tree } = await setupOwnerAndTree('cascade-photo');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      // link が存在することを確認
      const { data: before } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);
      expect(before).toHaveLength(1);

      await adminClient.from('photo').delete().eq('id', photo.id);

      const { data: after } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);
      expect(after).toHaveLength(0);
    });

    it('[正常系] person を削除すると photo_person_link も CASCADE 削除される', async () => {
      const { tree } = await setupOwnerAndTree('cascade-person');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      // link が存在することを確認
      const { data: before } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('person_id', person.id);
      expect(before).toHaveLength(1);

      await adminClient.from('person').delete().eq('id', person.id);

      const { data: after } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('person_id', person.id);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - アクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: アクセス制御', () => {
    it('[異常系] anon ユーザーは photo_person_link を SELECT できない', async () => {
      const { tree } = await setupOwnerAndTree('rls-anon');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      const { data, error } = await anonClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] anon ユーザーは photo_person_link を INSERT できない', async () => {
      const { tree } = await setupOwnerAndTree('rls-anon-insert');

      const photo = await createPhoto(tree.id);
      const person = await createPerson(tree.id);

      const { error } = await anonClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の tree 配下の photo と person への link は INSERT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-insert-a');

      const emailB = `test-ppl-rls-insert-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photo = await createPhoto(treeA.id);
      const person = await createPerson(treeA.id);

      // ユーザーB が ユーザーA の photo+person にリンクを試みる
      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の photo 配下の link への DELETE は 0 rows affected', async () => {
      // ユーザーA の photo + person でリンクを作成し、ユーザーB が DELETE を試みる
      const { tree: treeA } = await setupOwnerAndTree('rls-delete-a');

      const emailB = `test-ppl-rls-del-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photoA = await createPhoto(treeA.id);
      const personA = await createPerson(treeA.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photoA.id, person_id: personA.id });

      // ユーザーB が ユーザーA の link を削除しようとする
      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('photo_person_link')
        .delete()
        .eq('photo_id', photoA.id)
        .eq('person_id', personA.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      // adminClient でリンクが残存していることを二重確認
      const { data: check } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photoA.id)
        .eq('person_id', personA.id);
      expect(check).toHaveLength(1);
    });

    it('[異常系] 他人の tree の link は SELECT できない', async () => {
      const { tree: treeA } = await setupOwnerAndTree('rls-select-a');

      const emailB = `test-ppl-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const photo = await createPhoto(treeA.id);
      const person = await createPerson(treeA.id);

      await adminClient
        .from('photo_person_link')
        .insert({ photo_id: photo.id, person_id: person.id });

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photo.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[設計意図] 自分の photo に他人 tree の person をリンクすることは許容される（photo 側 RLS のみ）', async () => {
      // RLS 設計: photo_person_link の WITH CHECK は photo 経由のツリーオーナーのみをチェック
      // person 側のツリーオーナーチェックは意図的に省略されているため、
      // 自分の photo に他人 tree の person をリンクする INSERT は成功する（仕様通り）
      // 補足: ツリー境界の整合性はアプリケーション層で担保する設計
      const { email: emailA, tree: treeA } = await setupOwnerAndTree('cross-a');

      const emailB = `test-ppl-cross-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: treeB } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userIdB, title: 'ユーザーBの家系図' })
        .select()
        .single();

      const photoA = await createPhoto(treeA.id);
      const personB = await createPerson(treeB!.id, 'ユーザーBの人物');

      // ユーザーA が自分の photo（treeA）+ ユーザーBの person（treeB）でリンク INSERT
      const clientA = await createUserClient(emailA, 'Password123!');
      const { data, error } = await clientA
        .from('photo_person_link')
        .insert({ photo_id: photoA.id, person_id: personB.id })
        .select()
        .single();

      // photo 側 RLS のみチェックするため、INSERT は成功する（設計意図）
      expect(error).toBeNull();
      expect(data).not.toBeNull();

      // adminClient でリンクが実際に作成されていることを二重確認
      const { data: verify } = await adminClient
        .from('photo_person_link')
        .select('*')
        .eq('photo_id', photoA.id)
        .eq('person_id', personB.id);
      expect(verify).toHaveLength(1);
    });
  });
});
