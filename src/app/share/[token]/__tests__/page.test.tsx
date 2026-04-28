/**
 * src/app/share/[token]/page.tsx のテスト
 *
 * Server Component テスト。Jest の制約により jsdom レンダリングは行わず、
 * 関数の戻り値・notFound 呼び出し・generateMetadata の戻り値を検証する。
 *
 * 検証観点:
 * - page 本体: getSharedTree が null → notFound が呼ばれること
 * - page 本体: getSharedTree が有効データ → notFound が呼ばれず JSX が返されること
 * - page 本体: params から token を抽出して getSharedTree に渡すこと
 * - generateMetadata: null → robots.index が false のメタデータ
 * - generateMetadata: 有効データ → title "{tree名} - 家系図"
 * - generateMetadata: 有効データ → robots.index: false, follow: false
 *
 * @jest-environment node
 */

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('@/features/share/lib/get-shared-tree', () => ({
  getSharedTree: jest.fn(),
}));

// CSS Modules モック (node 環境で className を文字列として返す)
jest.mock('../page.module.css', () => new Proxy({}, { get: (_t, key) => String(key) }));

import { notFound } from 'next/navigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSharedTree } from '@/features/share/lib/get-shared-tree';
import SharePage, { generateMetadata } from '../page';

const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockGetSharedTree = getSharedTree as jest.MockedFunction<typeof getSharedTree>;

// ---------------------------------------------------------------------------
// テスト用データ
// ---------------------------------------------------------------------------

const mockSharedTreeData = {
  tree: {
    id: 'tree-1',
    name: '山田家の家系図',
    description: 'テスト用家系図',
    ownerUserId: 'owner-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
  },
  persons: [
    {
      id: 'person-1',
      treeId: 'tree-1',
      displayName: '山田 太郎',
      familyName: '山田',
      givenName: '太郎',
      maidenName: null,
      gender: 'male',
      birthYear: 1950,
      birthMonth: null,
      birthDay: null,
      birthPlace: null,
      deathYear: 2020,
      deathMonth: null,
      deathDay: null,
      deathPlace: null,
      isAlive: false,
      note: null,
      primaryPhotoId: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ],
  relations: [],
  photos: [],
};

// ---------------------------------------------------------------------------
// page 本体のテスト
// ---------------------------------------------------------------------------

describe('SharePage (page 本体)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSharedTree が null を返した場合 notFound が呼ばれること', async () => {
    mockGetSharedTree.mockResolvedValue(null);

    await expect(SharePage({ params: Promise.resolve({ token: 'invalid-token' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('getSharedTree が有効なデータを返した場合 notFound は呼ばれないこと', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

    await SharePage({ params: Promise.resolve({ token: 'valid-token' }) });

    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('getSharedTree が有効なデータを返した場合 JSX (React 要素) が返されること', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await SharePage({ params: Promise.resolve({ token: 'valid-token' }) }) as any;

    // React 要素であること ($$typeof が react 要素を示す Symbol)
    expect(result).not.toBeNull();
    // React 19 以降 'react.transitional.element' を使用するため、両方を許容する
    const reactElementSymbols = [
      Symbol.for('react.element'),
      Symbol.for('react.transitional.element'),
    ];
    expect(reactElementSymbols).toContain(result.$$typeof);
  });

  it('getSharedTree が有効なデータを返した場合 tree.name がレンダリング結果に含まれること', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await SharePage({ params: Promise.resolve({ token: 'valid-token' }) }) as any;
    const html = renderToStaticMarkup(result);

    expect(html).toContain('山田家の家系図');
  });

  it('params から token を抽出して getSharedTree に渡すこと', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

    await SharePage({ params: Promise.resolve({ token: 'my-special-token' }) });

    expect(mockGetSharedTree).toHaveBeenCalledWith('my-special-token');
  });

  it('persons が空の場合でも正常に JSX が返されること', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue({ ...mockSharedTreeData, persons: [] } as any);

    const result = await SharePage({ params: Promise.resolve({ token: 'empty-tree-token' }) });

    expect(result).not.toBeNull();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateMetadata のテスト
// ---------------------------------------------------------------------------

describe('generateMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSharedTree が null の場合', () => {
    it('robots: { index: false } を含むメタデータを返すこと', async () => {
      mockGetSharedTree.mockResolvedValue(null);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'invalid' }) });

      expect(metadata.robots).toMatchObject({ index: false });
    });

    it('title が "共有ページが見つかりません" であること', async () => {
      mockGetSharedTree.mockResolvedValue(null);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'invalid' }) });

      expect(metadata.title).toBe('共有ページが見つかりません');
    });

    it('getSharedTree が token を受け取って呼ばれること', async () => {
      mockGetSharedTree.mockResolvedValue(null);

      await generateMetadata({ params: Promise.resolve({ token: 'test-token-meta' }) });

      expect(mockGetSharedTree).toHaveBeenCalledWith('test-token-meta');
    });

    it('無効トークン時 robots に follow が含まれないこと', async () => {
      mockGetSharedTree.mockResolvedValue(null);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'invalid' }) });

      // index: false のみ設定され、follow は設定されていないこと
      expect(metadata.robots).toEqual({ index: false });
      expect(metadata.robots).not.toHaveProperty('follow');
    });
  });

  describe('getSharedTree が有効データを返す場合', () => {
    it('title が "{tree名} - 家系図" 形式であること', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'valid' }) });

      expect(metadata.title).toBe('山田家の家系図 - 家系図');
    });

    it('robots: { index: false, follow: false } が設定されていること', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'valid' }) });

      expect(metadata.robots).toMatchObject({ index: false, follow: false });
    });

    it('openGraph が設定されていること', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'valid' }) });

      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBe('山田家の家系図 - 家系図');
    });

    it('description が設定されていること', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetSharedTree.mockResolvedValue(mockSharedTreeData as any);

      const metadata = await generateMetadata({ params: Promise.resolve({ token: 'valid' }) });

      expect(metadata.description).toBeDefined();
      expect(typeof metadata.description).toBe('string');
    });
  });
});

// ---------------------------------------------------------------------------
// 指摘6: buildPersonMeta のロジック検証 (SharePage 経由の間接検証)
// ---------------------------------------------------------------------------

describe('buildPersonMeta (SharePage 経由の間接検証)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** 指定した person 情報で SharePage をレンダリングして HTML 文字列を返す */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderWithPerson(personOverrides: Record<string, any>) {
    const person = { ...mockSharedTreeData.persons[0], ...personOverrides };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetSharedTree.mockResolvedValue({ ...mockSharedTreeData, persons: [person] } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = await SharePage({ params: Promise.resolve({ token: 'test-token' }) }) as any;
    return renderToStaticMarkup(element);
  }

  it('gender + birthYear + isAlive=false + deathYear → "男性 · 1980年生 · 2020年没" が含まれること', async () => {
    const html = await renderWithPerson({
      gender: 'male',
      birthYear: 1980,
      isAlive: false,
      deathYear: 2020,
    });

    expect(html).toContain('男性 · 1980年生 · 2020年没');
  });

  it('gender のみ → "男性" が含まれること', async () => {
    const html = await renderWithPerson({
      gender: 'male',
      birthYear: null,
      isAlive: true,
      deathYear: null,
    });

    expect(html).toContain('男性');
  });

  it('isAlive=true で deathYear あり → deathYear は表示されないこと', async () => {
    const html = await renderWithPerson({
      gender: 'male',
      birthYear: 1980,
      isAlive: true,
      deathYear: 2020,
    });

    expect(html).toContain('男性 · 1980年生');
    expect(html).not.toContain('2020年没');
  });

  it('gender=null, birthYear=null → meta が空文字になり meta 段落が非表示になること', async () => {
    const html = await renderWithPerson({
      gender: null,
      birthYear: null,
      isAlive: true,
      deathYear: null,
    });

    // meta が空文字の場合、personMeta クラスの <p> 要素が出力されないこと
    // page.tsx: {meta && <p className={styles.personMeta}>{meta}</p>}
    expect(html).not.toContain('personMeta');
  });
});
