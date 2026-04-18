/**
 * person テーブルのマイグレーションテスト
 *
 * マイグレーションファイル: 20260418000007_create_person.sql
 *
 * 前提: `supabase db reset` でマイグレーションと seed が適用済みであること
 *
 * テスト観点:
 * - [正常系] tree owner が自分の tree 配下に person を INSERT / SELECT / UPDATE / DELETE 可能
 * - [異常系] 他人の tree 配下の person は SELECT できない
 * - [異常系] 他人の tree_id を指定して person を INSERT できない（WITH CHECK でブロック）
 * - [異常系] gender の CHECK 違反で INSERT 失敗
 * - [異常系] birth_year が範囲外で失敗
 * - [異常系] death_year が birth_year より小さい場合に失敗
 * - [正常系] birth_year/death_year が NULL の場合は CHECK 影響なし
 * - [正常系] is_alive のデフォルトが true
 * - [異常系] birth_month/birth_day が範囲外で失敗
 * - [正常系] tree 削除で person が CASCADE 削除
 * - [正常系] primary_photo_id は uuid カラムとして自由に入れられる（FK なし）
 * - [正常系] updated_at 自動更新
 */

import {
  adminClient,
  anonClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from '../helpers/supabase-clients';

jest.setTimeout(30000);

describe('person テーブル', () => {
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
    const email = `test-person-${suffix}-${Date.now()}@example.com`;
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
  // 正常系: CRUD 操作
  // ---------------------------------------------------------------------------
  describe('CRUD: 自分の tree 配下への操作', () => {
    it('[正常系] tree owner が person を INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('insert');

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('person')
        .insert({ tree_id: tree.id, display_name: '山田 太郎' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.display_name).toBe('山田 太郎');
      expect(data!.tree_id).toBe(tree.id);
    });

    it('[正常系] tree owner が person を SELECT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('select');

      const { data: inserted } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'SELECT 対象人物' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { data, error } = await clientSelf
        .from('person')
        .select('*')
        .eq('id', inserted!.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(inserted!.id);
    });

    it('[正常系] tree owner が person を UPDATE できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('update');

      const { data: inserted } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: '更新前' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('person')
        .update({ display_name: '更新後' })
        .eq('id', inserted!.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('person')
        .select('display_name')
        .eq('id', inserted!.id)
        .single();
      expect(after!.display_name).toBe('更新後');
    });

    it('[正常系] tree owner が person を DELETE できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('delete');

      const { data: inserted } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: '削除対象' })
        .select()
        .single();

      const clientSelf = await createUserClient(email, 'Password123!');
      const { error } = await clientSelf
        .from('person')
        .delete()
        .eq('id', inserted!.id);

      expect(error).toBeNull();

      const { data: after } = await adminClient
        .from('person')
        .select('id')
        .eq('id', inserted!.id);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: updated_at 自動更新
  // ---------------------------------------------------------------------------
  describe('updated_at 自動更新トリガー', () => {
    it('[正常系] person を UPDATE すると updated_at が現在時刻に更新される', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('updated-at');

      const { data: inserted } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'updated_at テスト' })
        .select()
        .single();

      const beforeUpdatedAt = inserted!.updated_at;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await adminClient
        .from('person')
        .update({ display_name: 'updated_at 更新後' })
        .eq('id', inserted!.id);

      const { data: after } = await adminClient
        .from('person')
        .select('updated_at')
        .eq('id', inserted!.id)
        .single();

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(beforeUpdatedAt).getTime()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: デフォルト値
  // ---------------------------------------------------------------------------
  describe('デフォルト値', () => {
    it('[正常系] is_alive のデフォルト値は true', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('is-alive-default');

      const { data: inserted } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'デフォルトテスト' })
        .select()
        .single();

      expect(inserted!.is_alive).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: primary_photo_id は FK なしの uuid カラム
  // ---------------------------------------------------------------------------
  describe('primary_photo_id', () => {
    it('[正常系] primary_photo_id に任意の uuid を設定できる（FK なし）', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('photo-id');

      const dummyPhotoId = '00000000-0000-0000-0000-000000000001';
      const { data, error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'photo テスト',
          primary_photo_id: dummyPhotoId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.primary_photo_id).toBe(dummyPhotoId);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: RLS - 他人の tree 配下の person へのアクセス制御
  // ---------------------------------------------------------------------------
  describe('RLS: 他人の tree 配下の person へのアクセス制御', () => {
    it('[異常系] 他人の tree 配下の person は SELECT できない', async () => {
      const { email: emailA, userId: userIdA, tree: treeA } = await setupOwnerAndTree('rls-select-a');

      const emailB = `test-person-rls-select-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: treeA.id, display_name: 'ユーザーAの人物' })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('person')
        .select('*')
        .eq('id', person!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('[異常系] 他人の tree_id を指定して person を INSERT できない（WITH CHECK でブロック）', async () => {
      const { email: emailA, userId: userIdA, tree: treeA } = await setupOwnerAndTree('rls-insert-a');

      const emailB = `test-person-rls-insert-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      // ユーザーB がユーザーA の tree_id を指定して INSERT を試みる
      const clientB = await createUserClient(emailB, 'Password123!');
      const { error } = await clientB
        .from('person')
        .insert({ tree_id: treeA.id, display_name: '不正な人物追加' });

      // INSERT の RLS 拒否はエラーになる
      expect(error).not.toBeNull();
    });

    it('[異常系] 他人の tree 配下の person への UPDATE は 0 rows affected', async () => {
      const { email: emailA, userId: userIdA, tree: treeA } = await setupOwnerAndTree('rls-update-a');

      const emailB = `test-person-rls-update-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: treeA.id, display_name: '変更されない人物' })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('person')
        .update({ display_name: '不正な変更' })
        .eq('id', person!.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const { data: check } = await adminClient
        .from('person')
        .select('display_name')
        .eq('id', person!.id)
        .single();
      expect(check!.display_name).toBe('変更されない人物');
    });

    it('[異常系] 他人の tree 配下の person への DELETE は 0 rows affected', async () => {
      const { email: emailA, userId: userIdA, tree: treeA } = await setupOwnerAndTree('rls-delete-a');

      const emailB = `test-person-rls-delete-b-${Date.now()}@example.com`;
      const userIdB = await createTestUser(emailB, 'Password123!');
      createdUserIds.push(userIdB);

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: treeA.id, display_name: '削除されない人物' })
        .select()
        .single();

      const clientB = await createUserClient(emailB, 'Password123!');
      const { data, error } = await clientB
        .from('person')
        .delete()
        .eq('id', person!.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const { data: check } = await adminClient
        .from('person')
        .select('id')
        .eq('id', person!.id);
      expect(check).toHaveLength(1);
    });

    it('[異常系] anon ユーザーは person を SELECT できない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('rls-anon');

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: '未認証からは見えない' })
        .select()
        .single();

      const { data, error } = await anonClient
        .from('person')
        .select('*')
        .eq('id', person!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: gender CHECK 制約
  // ---------------------------------------------------------------------------
  describe('gender CHECK 制約', () => {
    it('[異常系] gender に許可外の値を入れると INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-check');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender テスト', gender: 'invalid' });

      expect(error).not.toBeNull();
    });

    it('[正常系] gender に male を指定して INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-male');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender male テスト', gender: 'male' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.gender).toBe('male');
    });

    it('[正常系] gender に female を指定して INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-female');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender female テスト', gender: 'female' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.gender).toBe('female');
    });

    it('[正常系] gender に other を指定して INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-other');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender other テスト', gender: 'other' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.gender).toBe('other');
    });

    it('[正常系] gender に unknown を指定して INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-unknown');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender unknown テスト', gender: 'unknown' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.gender).toBe('unknown');
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: birth_year CHECK 制約
  // ---------------------------------------------------------------------------
  describe('birth_year CHECK 制約', () => {
    it('[異常系] birth_year が 999（範囲外下限）で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-year-low');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_year 下限テスト', birth_year: 999 });

      expect(error).not.toBeNull();
    });

    it('[異常系] birth_year が 10000（範囲外上限）で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-year-high');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_year 上限テスト', birth_year: 10000 });

      expect(error).not.toBeNull();
    });

    it('[正常系] birth_year が NULL の場合は CHECK の影響を受けない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-year-null');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_year null テスト', birth_year: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_year).toBeNull();
    });

    it('[正常系] birth_year が 1000（有効下限）で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-year-min');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_year 1000 テスト', birth_year: 1000 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_year).toBe(1000);
    });

    it('[正常系] birth_year が 9999（有効上限）で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-year-max');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_year 9999 テスト', birth_year: 9999 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_year).toBe(9999);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: death_year CHECK 制約
  // ---------------------------------------------------------------------------
  describe('death_year CHECK 制約', () => {
    it('[異常系] death_year が birth_year より小さい場合に INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-before-birth');

      const { error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'death < birth テスト',
          birth_year: 2000,
          death_year: 1999,
        });

      expect(error).not.toBeNull();
    });

    it('[正常系] death_year が birth_year と同じ場合は許可される', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-equal-birth');

      const { data, error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'death == birth テスト',
          birth_year: 2000,
          death_year: 2000,
        })
        .select()
        .single();

      expect(error).toBeNull();
    });

    it('[正常系] death_year が NULL の場合は CHECK の影響を受けない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-year-null');

      const { data, error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'death_year null テスト',
          birth_year: 2000,
          death_year: null,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_year).toBeNull();
    });

    it('[正常系] birth_year が NULL の場合、death_year は CHECK の影響を受けない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-null-death-set');

      const { data, error } = await adminClient
        .from('person')
        .insert({
          tree_id: tree.id,
          display_name: 'birth null death set テスト',
          birth_year: null,
          death_year: 1999,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_year).toBe(1999);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: birth_month / birth_day CHECK 制約
  // ---------------------------------------------------------------------------
  describe('birth_month / birth_day CHECK 制約', () => {
    it('[異常系] birth_month が 0 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-month-0');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_month 0 テスト', birth_month: 0 });

      expect(error).not.toBeNull();
    });

    it('[異常系] birth_month が 13 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-month-13');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_month 13 テスト', birth_month: 13 });

      expect(error).not.toBeNull();
    });

    it('[正常系] birth_month が 1 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-month-1');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_month 1 テスト', birth_month: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_month).toBe(1);
    });

    it('[正常系] birth_month が 12 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-month-12');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_month 12 テスト', birth_month: 12 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_month).toBe(12);
    });

    it('[異常系] birth_day が 0 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-day-0');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_day 0 テスト', birth_day: 0 });

      expect(error).not.toBeNull();
    });

    it('[異常系] birth_day が 32 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-day-32');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_day 32 テスト', birth_day: 32 });

      expect(error).not.toBeNull();
    });

    it('[正常系] birth_day が 1 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-day-1');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_day 1 テスト', birth_day: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_day).toBe(1);
    });

    it('[正常系] birth_day が 31 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-day-31');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_day 31 テスト', birth_day: 31 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_day).toBe(31);
    });

    it('[正常系] birth_month が NULL の場合は CHECK の影響を受けない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('birth-month-null');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'birth_month null テスト', birth_month: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.birth_month).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: death_year 範囲 CHECK 制約（追加）
  // ---------------------------------------------------------------------------
  describe('death_year 範囲 CHECK 制約', () => {
    it('[異常系] death_year が 999（範囲外下限）で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-year-low');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_year 下限テスト', death_year: 999 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] death_year が 10000（範囲外上限）で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-year-high');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_year 上限テスト', death_year: 10000 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] death_year が 1000（有効下限）で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-year-min');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_year 1000 テスト', death_year: 1000 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_year).toBe(1000);
    });

    it('[正常系] death_year が 9999（有効上限）で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-year-max');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_year 9999 テスト', death_year: 9999 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_year).toBe(9999);
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: death_month CHECK 制約（追加）
  // ---------------------------------------------------------------------------
  describe('death_month CHECK 制約', () => {
    it('[異常系] death_month が 0 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-month-0');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_month 0 テスト', death_month: 0 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] death_month が 13 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-month-13');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_month 13 テスト', death_month: 13 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] death_month が 1 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-month-1');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_month 1 テスト', death_month: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_month).toBe(1);
    });

    it('[正常系] death_month が 12 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-month-12');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_month 12 テスト', death_month: 12 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_month).toBe(12);
    });

    it('[正常系] death_month が NULL の場合は CHECK の影響を受けない', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-month-null');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_month null テスト', death_month: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_month).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 異常系: death_day CHECK 制約（追加）
  // ---------------------------------------------------------------------------
  describe('death_day CHECK 制約', () => {
    it('[異常系] death_day が 0 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-day-0');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_day 0 テスト', death_day: 0 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[異常系] death_day が 32 で INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-day-32');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_day 32 テスト', death_day: 32 });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514'); // check_violation
    });

    it('[正常系] death_day が 1 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-day-1');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_day 1 テスト', death_day: 1 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_day).toBe(1);
    });

    it('[正常系] death_day が 31 で INSERT できる', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('death-day-31');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'death_day 31 テスト', death_day: 31 })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.death_day).toBe(31);
    });
  });

  // ---------------------------------------------------------------------------
  // その他: gender NULL / display_name NOT NULL（追加）
  // ---------------------------------------------------------------------------
  describe('gender NULL および display_name NOT NULL', () => {
    it('[正常系] gender に NULL を指定して INSERT できる（gender 未設定は許容）', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('gender-null');

      const { data, error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'gender null テスト', gender: null })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.gender).toBeNull();
    });

    it('[異常系] display_name が NULL の場合 INSERT に失敗する', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('display-name-null');

      const { error } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: null });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23502'); // not_null_violation
    });
  });

  // ---------------------------------------------------------------------------
  // 正常系: CASCADE 削除
  // ---------------------------------------------------------------------------
  describe('CASCADE 削除', () => {
    it('[正常系] tree を削除すると person も CASCADE 削除される', async () => {
      const { email, userId, tree } = await setupOwnerAndTree('cascade-tree');

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: tree.id, display_name: 'CASCADE テスト人物' })
        .select()
        .single();

      // person が存在することを確認
      const { data: before } = await adminClient
        .from('person')
        .select('id')
        .eq('id', person!.id);
      expect(before).toHaveLength(1);

      // tree を削除（CASCADE で person も削除されるはず）
      await adminClient.from('tree').delete().eq('id', tree.id);

      // person も削除されていることを確認
      const { data: after } = await adminClient
        .from('person')
        .select('id')
        .eq('id', person!.id);
      expect(after).toHaveLength(0);
    });

    it('[正常系] auth.users を削除すると tree/person が CASCADE 削除される', async () => {
      const email = `test-person-cascade-user-${Date.now()}@example.com`;
      const userId = await createTestUser(email, 'Password123!');
      // 後処理リストには追加しない（このテスト内で削除する）

      const { data: tree } = await adminClient
        .from('tree')
        .insert({ owner_user_id: userId, title: 'CASCADE ユーザー削除テスト' })
        .select()
        .single();

      const { data: person } = await adminClient
        .from('person')
        .insert({ tree_id: tree!.id, display_name: 'CASCADE ユーザー削除人物' })
        .select()
        .single();

      await deleteTestUser(userId);

      const { data: after } = await adminClient
        .from('person')
        .select('id')
        .eq('id', person!.id);
      expect(after).toHaveLength(0);
    });
  });
});
