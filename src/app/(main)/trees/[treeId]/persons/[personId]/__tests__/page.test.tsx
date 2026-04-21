/**
 * PersonDetailPage 統合テスト
 *
 * テスト観点:
 * - getPerson 成功 + listRelations 成功 + getPhotos 成功 → PersonDetailPanel が props 付きで描画
 * - getPerson 失敗 → notFound が throw される
 * - listRelations 失敗 → relations=[] で PersonDetailPanel に渡る
 * - getPhotos 失敗 → photos=[] で PersonDetailPanel に渡る
 * - generateMetadata: getPerson 成功 → title が person.displayName
 * - generateMetadata: getPerson 失敗 → title が「人物詳細」フォールバック
 */

// server-only モジュールをモック
jest.mock('server-only', () => ({}));

// getPerson をモック
jest.mock('@/features/person/actions/get-person', () => ({
  getPerson: jest.fn(),
}));

// listRelations をモック
jest.mock('@/features/relation/actions/list-relations', () => ({
  listRelations: jest.fn(),
}));

// getPhotos をモック
jest.mock('@/features/photo/actions/get-photos', () => ({
  getPhotos: jest.fn(),
}));

// next/navigation の notFound をモック
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// PersonDetailPanel を軽量スタブに差し替え
jest.mock('@/features/person/components/PersonDetailPanel', () => ({
  PersonDetailPanel: function MockPersonDetailPanel({
    treeId,
    person,
    photos,
    relations,
  }: {
    treeId: string;
    person: { id: string; displayName: string };
    photos: unknown[];
    relations: unknown[];
  }) {
    return (
      <div data-testid="person-detail-panel">
        <span data-testid="panel-tree-id">{treeId}</span>
        <span data-testid="panel-person-id">{person.id}</span>
        <span data-testid="panel-person-name">{person.displayName}</span>
        <span data-testid="panel-photos-count">{photos.length}</span>
        <span data-testid="panel-relations-count">{relations.length}</span>
      </div>
    );
  },
}));

import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { getPerson } from '@/features/person/actions/get-person';
import { listRelations } from '@/features/relation/actions/list-relations';
import { getPhotos } from '@/features/photo/actions/get-photos';
import PersonDetailPage, { generateMetadata } from '../page';

const mockGetPerson = getPerson as jest.MockedFunction<typeof getPerson>;
const mockListRelations = listRelations as jest.MockedFunction<typeof listRelations>;
const mockGetPhotos = getPhotos as jest.MockedFunction<typeof getPhotos>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const MOCK_PERSON = {
  id: 'person-001',
  treeId: 'tree-001',
  displayName: '田中 太郎',
  familyName: '田中',
  givenName: '太郎',
  maidenName: null,
  gender: 'male',
  birthYear: 1980,
  birthMonth: 5,
  birthDay: 15,
  birthPlace: '東京都',
  deathYear: null,
  deathMonth: null,
  deathDay: null,
  deathPlace: null,
  isAlive: true,
  note: null,
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MOCK_RELATION = {
  id: 'rel-001',
  treeId: 'tree-001',
  kind: 'parent_child' as const,
  fromPersonId: 'person-001',
  toPersonId: 'person-002',
  parentRole: null,
  marriageType: null,
  marriageStatus: null,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  note: null,
  createdAt: '2024-01-01T00:00:00Z',
};

const MOCK_PHOTO = {
  id: 'photo-001',
  storageObjectKey: 'photos/photo-001.jpg',
  mimeType: 'image/jpeg',
  byteSize: 12345,
  takenYear: 2000,
  takenMonth: 1,
  takenDay: 1,
  caption: 'テスト写真',
  personIds: ['person-001'],
  createdAt: '2024-01-01T00:00:00Z',
};

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

async function renderPage(
  treeId = 'tree-001',
  personId = 'person-001'
) {
  const params = Promise.resolve({ treeId, personId });
  const page = await PersonDetailPage({ params });
  return render(page);
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('PersonDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ================================================================ */
  /* 正常表示                                                           */
  /* ================================================================ */

  describe('正常表示', () => {
    beforeEach(() => {
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      mockListRelations.mockResolvedValue({
        ok: true,
        data: { relations: [MOCK_RELATION] },
      });
      mockGetPhotos.mockResolvedValue({ ok: true, data: [MOCK_PHOTO] });
    });

    it('PersonDetailPanel が描画される', async () => {
      await renderPage();
      expect(screen.getByTestId('person-detail-panel')).toBeInTheDocument();
    });

    it('person.id が PersonDetailPanel に渡される', async () => {
      await renderPage('tree-001', 'person-001');
      expect(screen.getByTestId('panel-person-id')).toHaveTextContent('person-001');
    });

    it('person.displayName が PersonDetailPanel に渡される', async () => {
      await renderPage();
      expect(screen.getByTestId('panel-person-name')).toHaveTextContent('田中 太郎');
    });

    it('treeId が PersonDetailPanel に渡される', async () => {
      await renderPage('tree-001');
      expect(screen.getByTestId('panel-tree-id')).toHaveTextContent('tree-001');
    });

    it('relations が PersonDetailPanel に渡される（1件）', async () => {
      await renderPage();
      expect(screen.getByTestId('panel-relations-count')).toHaveTextContent('1');
    });

    it('photos が PersonDetailPanel に渡される（1件）', async () => {
      await renderPage();
      expect(screen.getByTestId('panel-photos-count')).toHaveTextContent('1');
    });
  });

  /* ================================================================ */
  /* getPerson 失敗 → notFound                                         */
  /* ================================================================ */

  describe('getPerson 失敗', () => {
    it('getPerson が { ok: false } を返す場合、notFound() が呼ばれて throw される', async () => {
      mockGetPerson.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
      });
      mockListRelations.mockResolvedValue({ ok: true, data: { relations: [] } });
      mockGetPhotos.mockResolvedValue({ ok: true, data: [] });

      await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });

    it('UNAUTHENTICATED エラーでも notFound() が呼ばれる', async () => {
      mockGetPerson.mockResolvedValue({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' },
      });
      mockListRelations.mockResolvedValue({ ok: true, data: { relations: [] } });
      mockGetPhotos.mockResolvedValue({ ok: true, data: [] });

      await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* listRelations 失敗 → relations=[]                                 */
  /* ================================================================ */

  describe('listRelations 失敗', () => {
    beforeEach(() => {
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      mockGetPhotos.mockResolvedValue({ ok: true, data: [MOCK_PHOTO] });
    });

    it('listRelations が { ok: false } を返す場合、relations=[] で PersonDetailPanel に渡る', async () => {
      mockListRelations.mockResolvedValue({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'アクセス権がありません' },
      });

      await renderPage();
      expect(screen.getByTestId('panel-relations-count')).toHaveTextContent('0');
    });
  });

  /* ================================================================ */
  /* getPhotos 失敗 → photos=[]                                        */
  /* ================================================================ */

  describe('getPhotos 失敗', () => {
    beforeEach(() => {
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      mockListRelations.mockResolvedValue({
        ok: true,
        data: { relations: [MOCK_RELATION] },
      });
    });

    it('getPhotos が { ok: false } を返す場合、photos=[] で PersonDetailPanel に渡る', async () => {
      mockGetPhotos.mockResolvedValue({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'アクセス権がありません' },
      });

      await renderPage();
      expect(screen.getByTestId('panel-photos-count')).toHaveTextContent('0');
    });
  });

  /* ================================================================ */
  /* generateMetadata                                                  */
  /* ================================================================ */

  describe('generateMetadata', () => {
    it('getPerson 成功 → title が person.displayName', async () => {
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });

      const params = Promise.resolve({ treeId: 'tree-001', personId: 'person-001' });
      const metadata = await generateMetadata({ params });

      expect(metadata.title).toBe('田中 太郎');
    });

    it('getPerson 成功 → description に人物名が含まれる', async () => {
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });

      const params = Promise.resolve({ treeId: 'tree-001', personId: 'person-001' });
      const metadata = await generateMetadata({ params });

      expect(String(metadata.description)).toContain('田中 太郎');
    });

    it('getPerson 失敗 → title が「人物詳細」フォールバック', async () => {
      mockGetPerson.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: '人物が見つかりません' },
      });

      const params = Promise.resolve({ treeId: 'tree-001', personId: 'person-999' });
      const metadata = await generateMetadata({ params });

      expect(metadata.title).toBe('人物詳細');
    });
  });
});
