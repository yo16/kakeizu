/**
 * get-shared-tree.ts ユニットテスト
 *
 * テスト対象: getSharedTree(token)
 *
 * 方針:
 *   - server-only と createServiceRoleClient をモック
 *   - Supabase クライアントは jest.fn() チェーンで構築したスタブを使用
 *   - handlers.test.ts の buildSupabaseStub パターンを応用
 *
 * @jest-environment node
 */

jest.mock('server-only', () => ({}));

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(),
}));

// React cache をスルーするモック（テスト中は実装をそのまま実行させる）
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: (fn: unknown) => fn,
  };
});

import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSharedTree } from '../get-shared-tree';

const mockCreateServiceRoleClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;

// ---------------------------------------------------------------------------
// Supabase スタブ ファクトリ
// ---------------------------------------------------------------------------

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * share_link 検索用チェーン: .from('share_link').select().eq().eq().is().maybeSingle()
 */
function buildShareLinkChain(result: QueryResult) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const is = jest.fn().mockReturnValue({ maybeSingle });
  const eqIs = jest.fn().mockReturnValue({ is });
  const eqEnabled = jest.fn().mockReturnValue({ eq: eqIs });
  const select = jest.fn().mockReturnValue({ eq: eqEnabled });
  return { select, eqEnabled, eqIs, is, maybeSingle };
}

/**
 * 単一テーブル SELECT 用チェーン: .from(table).select().eq().maybeSingle()
 */
function buildSingleSelectChain(result: QueryResult) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

/**
 * 複数行 SELECT + order 用チェーン: .from(table).select().eq().order()
 */
function buildMultiSelectChain(result: QueryResult) {
  const order = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, order };
}

interface StubOptions {
  linkResult?: QueryResult;
  treeResult?: QueryResult;
  personsResult?: QueryResult;
  relationsResult?: QueryResult;
  photosResult?: QueryResult;
}

function buildSupabaseStub(opts: StubOptions = {}) {
  const linkResult: QueryResult = opts.linkResult ?? {
    data: { id: 'link-1', tree_id: 'tree-1', is_enabled: true, revoked_at: null },
    error: null,
  };
  const treeResult: QueryResult = opts.treeResult ?? {
    data: {
      id: 'tree-1',
      name: 'テストの家系図',
      description: 'テスト用',
      owner_user_id: 'owner-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
    error: null,
  };
  const personsResult: QueryResult = opts.personsResult ?? { data: [], error: null };
  const relationsResult: QueryResult = opts.relationsResult ?? { data: [], error: null };
  const photosResult: QueryResult = opts.photosResult ?? { data: [], error: null };

  const linkChain = buildShareLinkChain(linkResult);
  const treeChain = buildSingleSelectChain(treeResult);
  const personsChain = buildMultiSelectChain(personsResult);
  const relationsChain = buildMultiSelectChain(relationsResult);
  const photosChain = buildMultiSelectChain(photosResult);

  const from = jest.fn((table: string) => {
    if (table === 'share_link') return { select: linkChain.select };
    if (table === 'tree') return { select: treeChain.select };
    if (table === 'person') return { select: personsChain.select };
    if (table === 'relation') return { select: relationsChain.select };
    if (table === 'photo') return { select: photosChain.select };
    throw new Error(`unexpected table: ${table}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateServiceRoleClient.mockReturnValue({ from } as any);

  return {
    from,
    linkChain,
    treeChain,
    personsChain,
    relationsChain,
    photosChain,
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('getSharedTree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // share_link 検索が見つからない / エラー
  // -------------------------------------------------------------------------

  describe('share_link が見つからない場合', () => {
    it('share_link が見つからない場合 null を返すこと', async () => {
      buildSupabaseStub({ linkResult: { data: null, error: null } });

      const result = await getSharedTree('token-notfound');

      expect(result).toBeNull();
    });

    it('share_link 検索エラー時 null を返すこと', async () => {
      buildSupabaseStub({ linkResult: { data: null, error: { message: 'DB error' } } });

      const result = await getSharedTree('token-error');

      expect(result).toBeNull();
    });

    it('share_link 検索エラー時 console.error が呼ばれること', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      buildSupabaseStub({ linkResult: { data: null, error: { message: 'DB error' } } });

      await getSharedTree('token-error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getSharedTree]'),
        expect.anything()
      );
    });
  });

  // -------------------------------------------------------------------------
  // is_enabled / revoked_at の検索条件
  // -------------------------------------------------------------------------

  describe('is_enabled=false や revoked_at NOT NULL のリンクは検索条件で除外されること', () => {
    it('.eq("is_enabled", true) が呼ばれること', async () => {
      const stub = buildSupabaseStub();

      await getSharedTree('test-token');

      // eqIs は eqEnabled('token', token) が返す { eq: eqIs } の eq に相当する
      // 実装: .select().eq('token', token).eq('is_enabled', true).is('revoked_at', null)
      expect(stub.linkChain.eqIs).toHaveBeenCalledWith('is_enabled', true);
    });

    it('.is("revoked_at", null) が呼ばれること', async () => {
      const stub = buildSupabaseStub();

      await getSharedTree('test-token');

      expect(stub.linkChain.is).toHaveBeenCalledWith('revoked_at', null);
    });

    it('.eq("token", token) が正しい引数で呼ばれること', async () => {
      const stub = buildSupabaseStub();

      await getSharedTree('my-token');

      // eqEnabled は select() が返す eq = 最初の .eq() 呼び出しに相当する
      // 実装: .select().eq('token', token).eq('is_enabled', true)...
      expect(stub.linkChain.eqEnabled).toHaveBeenCalledWith('token', 'my-token');
    });
  });

  // -------------------------------------------------------------------------
  // tree が CASCADE 削除済み
  // -------------------------------------------------------------------------

  describe('tree が存在しない場合', () => {
    it('tree が CASCADE 削除済みの場合 (data null) null を返すこと', async () => {
      buildSupabaseStub({ treeResult: { data: null, error: null } });

      const result = await getSharedTree('test-token');

      expect(result).toBeNull();
    });

    it('tree 取得エラー時 null を返すこと', async () => {
      buildSupabaseStub({ treeResult: { data: null, error: { message: 'tree DB error' } } });

      const result = await getSharedTree('test-token');

      expect(result).toBeNull();
    });

    it('tree 取得エラー時 console.error が呼ばれること', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      buildSupabaseStub({ treeResult: { data: null, error: { message: 'tree DB error' } } });

      await getSharedTree('test-token');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getSharedTree]'),
        expect.anything()
      );
    });
  });

  // -------------------------------------------------------------------------
  // 正常系: SharedTreeData を返す (camelCase 変換確認)
  // -------------------------------------------------------------------------

  describe('正常系', () => {
    it('有効な link + tree がある場合 SharedTreeData を返すこと', async () => {
      buildSupabaseStub();

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.tree).toBeDefined();
      expect(result?.persons).toBeDefined();
      expect(result?.relations).toBeDefined();
      expect(result?.photos).toBeDefined();
    });

    it('snake_case から camelCase への変換が正しく行われること (tree)', async () => {
      buildSupabaseStub({
        treeResult: {
          data: {
            id: 'tree-99',
            name: 'サンプル家系図',
            description: '説明文',
            owner_user_id: 'owner-99',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-02-01T00:00:00Z',
          },
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.tree).toEqual({
        id: 'tree-99',
        name: 'サンプル家系図',
        description: '説明文',
        ownerUserId: 'owner-99',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-02-01T00:00:00Z',
      });
    });

    it('persons の snake_case → camelCase 変換が正しく行われること', async () => {
      buildSupabaseStub({
        personsResult: {
          data: [
            {
              id: 'person-1',
              tree_id: 'tree-1',
              display_name: '山田 太郎',
              family_name: '山田',
              given_name: '太郎',
              maiden_name: null,
              gender: 'male',
              birth_year: 1980,
              birth_month: 3,
              birth_day: 15,
              birth_place: '東京',
              death_year: null,
              death_month: null,
              death_day: null,
              death_place: null,
              is_alive: true,
              note: null,
              primary_photo_id: null,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.persons[0]).toMatchObject({
        id: 'person-1',
        treeId: 'tree-1',
        displayName: '山田 太郎',
        familyName: '山田',
        givenName: '太郎',
        gender: 'male',
        birthYear: 1980,
        isAlive: true,
      });
    });

    it('relations の snake_case → camelCase 変換が正しく行われること', async () => {
      buildSupabaseStub({
        relationsResult: {
          data: [
            {
              id: 'rel-1',
              tree_id: 'tree-1',
              kind: 'parent_child',
              from_person_id: 'person-1',
              to_person_id: 'person-2',
              parent_role: 'father',
              marriage_type: null,
              marriage_status: null,
              start_year: null,
              start_month: null,
              end_year: null,
              end_month: null,
              note: null,
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.relations[0]).toMatchObject({
        id: 'rel-1',
        treeId: 'tree-1',
        kind: 'parent_child',
        fromPersonId: 'person-1',
        toPersonId: 'person-2',
        parentRole: 'father',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 並列取得の確認
  // -------------------------------------------------------------------------

  describe('並列取得', () => {
    it('persons / relations / photos の並列取得が正しく行われること', async () => {
      const stub = buildSupabaseStub();

      await getSharedTree('valid-token');

      // tree, person, relation, photo のすべてが from() で呼ばれること
      const calledTables = stub.from.mock.calls.map((c: unknown[]) => c[0]);
      expect(calledTables).toContain('tree');
      expect(calledTables).toContain('person');
      expect(calledTables).toContain('relation');
      expect(calledTables).toContain('photo');
    });

    it('tree_id で person / relation / photo が絞り込まれること', async () => {
      const stub = buildSupabaseStub({
        linkResult: {
          data: { id: 'link-1', tree_id: 'tree-xyz', is_enabled: true, revoked_at: null },
          error: null,
        },
      });

      await getSharedTree('valid-token');

      expect(stub.personsChain.eq).toHaveBeenCalledWith('tree_id', 'tree-xyz');
      expect(stub.relationsChain.eq).toHaveBeenCalledWith('tree_id', 'tree-xyz');
      expect(stub.photosChain.eq).toHaveBeenCalledWith('tree_id', 'tree-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // photo_person_link join から personIds 抽出
  // -------------------------------------------------------------------------

  describe('photo_person_link join から personIds 配列が正しく抽出されること', () => {
    it('photo_person_link の person_id が personIds 配列に変換されること', async () => {
      buildSupabaseStub({
        photosResult: {
          data: [
            {
              id: 'photo-1',
              storage_object_key: 'images/photo-1.jpg',
              mime_type: 'image/jpeg',
              byte_size: 12345,
              taken_year: 2020,
              taken_month: 5,
              taken_day: 1,
              caption: 'テスト写真',
              created_at: '2024-01-01T00:00:00Z',
              photo_person_link: [
                { person_id: 'person-a' },
                { person_id: 'person-b' },
              ],
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.photos[0].personIds).toEqual(['person-a', 'person-b']);
    });

    it('photo_person_link が空配列の場合 personIds が空配列になること', async () => {
      buildSupabaseStub({
        photosResult: {
          data: [
            {
              id: 'photo-2',
              storage_object_key: 'images/photo-2.jpg',
              mime_type: 'image/jpeg',
              byte_size: 1024,
              taken_year: null,
              taken_month: null,
              taken_day: null,
              caption: null,
              created_at: '2024-01-01T00:00:00Z',
              photo_person_link: [],
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.photos[0].personIds).toEqual([]);
    });

    it('photo_person_link が null/undefined の場合 personIds が空配列になること', async () => {
      buildSupabaseStub({
        photosResult: {
          data: [
            {
              id: 'photo-3',
              storage_object_key: 'images/photo-3.jpg',
              mime_type: null,
              byte_size: null,
              taken_year: null,
              taken_month: null,
              taken_day: null,
              caption: null,
              created_at: '2024-01-01T00:00:00Z',
              photo_person_link: null,
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.photos[0].personIds).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 指摘2: persons/relations/photos エラー時のフォールバック
  // -------------------------------------------------------------------------

  describe('persons/relations/photos クエリエラー時の空配列フォールバック', () => {
    it('persons クエリがエラーを返した場合 persons が空配列になること (console.error は呼ばれない)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      buildSupabaseStub({
        personsResult: { data: null, error: { message: 'persons DB error' } },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.persons).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('relations クエリがエラーを返した場合 relations が空配列になること', async () => {
      buildSupabaseStub({
        relationsResult: { data: null, error: { message: 'relations DB error' } },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.relations).toEqual([]);
    });

    it('photos クエリがエラーを返した場合 photos が空配列になること', async () => {
      buildSupabaseStub({
        photosResult: { data: null, error: { message: 'photos DB error' } },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.photos).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 指摘3: photos の camelCase 変換
  // -------------------------------------------------------------------------

  describe('photos の snake_case → camelCase 変換', () => {
    it('photos の全フィールドが正しく camelCase に変換されること', async () => {
      buildSupabaseStub({
        photosResult: {
          data: [
            {
              id: 'photo-cam-1',
              storage_object_key: 'images/cam-test.jpg',
              mime_type: 'image/png',
              byte_size: 98765,
              taken_year: 2019,
              taken_month: 8,
              taken_day: 20,
              caption: 'camelCase テスト写真',
              created_at: '2024-03-01T00:00:00Z',
              photo_person_link: [{ person_id: 'person-cam-1' }],
            },
          ],
          error: null,
        },
      });

      const result = await getSharedTree('valid-token');

      expect(result?.photos[0]).toMatchObject({
        id: 'photo-cam-1',
        storageObjectKey: 'images/cam-test.jpg',
        mimeType: 'image/png',
        byteSize: 98765,
        takenYear: 2019,
        takenMonth: 8,
        takenDay: 20,
        caption: 'camelCase テスト写真',
        createdAt: '2024-03-01T00:00:00Z',
        personIds: ['person-cam-1'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // 指摘7: data: null 境界値
  // -------------------------------------------------------------------------

  describe('data: null 境界値フォールバック', () => {
    it('photosRes.data が null の場合 photos が空配列になること', async () => {
      buildSupabaseStub({
        photosResult: { data: null, error: null },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.photos).toEqual([]);
    });

    it('personsRes.data が null の場合 persons が空配列になること', async () => {
      buildSupabaseStub({
        personsResult: { data: null, error: null },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.persons).toEqual([]);
    });

    it('relationsRes.data が null の場合 relations が空配列になること', async () => {
      buildSupabaseStub({
        relationsResult: { data: null, error: null },
      });

      const result = await getSharedTree('valid-token');

      expect(result).not.toBeNull();
      expect(result?.relations).toEqual([]);
    });
  });
});
