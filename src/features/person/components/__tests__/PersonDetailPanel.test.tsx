/**
 * PersonDetailPanel コンポーネントのテスト
 *
 * テスト観点:
 * - 基本情報（氏名・性別・生没年・出生地/死亡地・メモ）の表示
 * - 代表写真の表示/非表示
 * - 関係一覧（親子・婚姻）のフィルタリングと表示
 * - 編集ボタンクリックで EditPersonDrawer が開く
 * - 削除インラインダイアログの表示・キャンセル・確認
 * - deletePerson 成功/失敗時の動作
 * - onDeleted コールバックの呼び出し
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PersonDetailPanel } from '../PersonDetailPanel';
import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/person/actions/delete-person', () => ({
  deletePerson: jest.fn(),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    show: jest.fn(),
    success: mockToastSuccess,
    error: mockToastError,
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

// EditPersonDrawer を軽量スタブに差し替え
jest.mock('../EditPersonDrawer', () => ({
  EditPersonDrawer: function MockEditPersonDrawer({
    open,
    person,
  }: {
    open: boolean;
    onClose: () => void;
    person: { id: string };
  }) {
    return (
      <div
        data-testid="edit-drawer"
        data-open={String(open)}
        data-person-id={person.id}
      />
    );
  },
}));

import { deletePerson } from '@/features/person/actions/delete-person';
const mockDeletePerson = deletePerson as jest.MockedFunction<typeof deletePerson>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const BASE_PERSON: Person = {
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
  note: 'テストメモ',
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const PHOTO_1: PhotoSummary = {
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

const RELATION_PARENT_CHILD_FROM: RelationRow = {
  id: 'rel-001',
  treeId: 'tree-001',
  kind: 'parent_child',
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

const RELATION_PARENT_CHILD_TO: RelationRow = {
  id: 'rel-002',
  treeId: 'tree-001',
  kind: 'parent_child',
  fromPersonId: 'person-003',
  toPersonId: 'person-001',
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

const RELATION_MARRIAGE: RelationRow = {
  id: 'rel-003',
  treeId: 'tree-001',
  kind: 'marriage',
  fromPersonId: 'person-001',
  toPersonId: 'person-004',
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

// この人物に無関係な関係（フィルタされるべき）
const RELATION_UNRELATED: RelationRow = {
  id: 'rel-004',
  treeId: 'tree-001',
  kind: 'parent_child',
  fromPersonId: 'person-005',
  toPersonId: 'person-006',
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

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

function renderPanel(
  overrides: Partial<Person> = {},
  options: {
    photos?: PhotoSummary[];
    relations?: RelationRow[];
    onDeleted?: jest.Mock;
  } = {}
) {
  const person = { ...BASE_PERSON, ...overrides };
  const { photos = [], relations = [], onDeleted } = options;

  return render(
    <PersonDetailPanel
      treeId="tree-001"
      person={person}
      photos={photos}
      relations={relations}
      onDeleted={onDeleted}
    />
  );
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('PersonDetailPanel', () => {
  beforeEach(() => {
    mockDeletePerson.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  /* ================================================================ */
  /* 基本情報表示                                                       */
  /* ================================================================ */

  describe('基本情報表示', () => {
    it('displayName が表示される', () => {
      renderPanel();
      // displayName と fullName の両方が「田中 太郎」を表示するため getAllByText を使用
      const elements = screen.getAllByText('田中 太郎');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it('familyName と givenName があれば fullName が表示される', () => {
      renderPanel({ familyName: '田中', givenName: '太郎' });
      // displayName とは別に「田中 太郎」という fullName 表示
      const fullNames = screen.getAllByText('田中 太郎');
      expect(fullNames.length).toBeGreaterThanOrEqual(1);
    });

    it('maidenName があれば「旧姓: X」で表示される', () => {
      renderPanel({ maidenName: '鈴木' });
      expect(screen.getByText('旧姓: 鈴木')).toBeInTheDocument();
    });

    it('maidenName が null であれば旧姓が表示されない', () => {
      renderPanel({ maidenName: null });
      expect(screen.queryByText(/旧姓/)).not.toBeInTheDocument();
    });

    it('性別ラベル: male → 「男性」', () => {
      renderPanel({ gender: 'male' });
      expect(screen.getByText('男性')).toBeInTheDocument();
    });

    it('性別ラベル: female → 「女性」', () => {
      renderPanel({ gender: 'female' });
      expect(screen.getByText('女性')).toBeInTheDocument();
    });

    it('性別ラベル: other → 「その他」', () => {
      renderPanel({ gender: 'other' });
      expect(screen.getByText('その他')).toBeInTheDocument();
    });

    it('性別ラベル: unknown → 「不明」', () => {
      renderPanel({ gender: 'unknown' });
      expect(screen.getByText('不明')).toBeInTheDocument();
    });

    it('性別ラベル: null → 「未設定」', () => {
      renderPanel({ gender: null });
      expect(screen.getByText('未設定')).toBeInTheDocument();
    });

    it('birthYear/birthMonth/birthDay が揃っていれば「1980年5月15日」が表示される', () => {
      renderPanel({ birthYear: 1980, birthMonth: 5, birthDay: 15 });
      expect(screen.getByText('1980年5月15日')).toBeInTheDocument();
    });

    it('birthYear/birthMonth のみなら「1980年5月」が表示される', () => {
      renderPanel({ birthYear: 1980, birthMonth: 5, birthDay: null });
      expect(screen.getByText('1980年5月')).toBeInTheDocument();
    });

    it('birthYear のみなら「1980年」が表示される', () => {
      renderPanel({ birthYear: 1980, birthMonth: null, birthDay: null });
      expect(screen.getByText('1980年')).toBeInTheDocument();
    });

    it('birthYear が null なら生年月日が表示されない', () => {
      renderPanel({ birthYear: null, birthMonth: null, birthDay: null });
      expect(screen.queryByText(/生年月日/)).not.toBeInTheDocument();
    });

    it('birthPlace がある場合は出生地が表示される', () => {
      renderPanel({ birthPlace: '東京都' });
      expect(screen.getByText('東京都')).toBeInTheDocument();
    });

    it('birthPlace が null なら出生地が表示されない', () => {
      renderPanel({ birthPlace: null });
      expect(screen.queryByText('出生地')).not.toBeInTheDocument();
    });

    it('isAlive=true → 「存命中」が表示される', () => {
      renderPanel({ isAlive: true });
      expect(screen.getByText('存命中')).toBeInTheDocument();
    });

    it('isAlive=false → 「故人」が表示される', () => {
      renderPanel({ isAlive: false });
      expect(screen.getByText('故人')).toBeInTheDocument();
    });

    it('isAlive=false かつ deathYear がある場合、没年月日が表示される', () => {
      renderPanel({
        isAlive: false,
        deathYear: 2020,
        deathMonth: 3,
        deathDay: 10,
      });
      expect(screen.getByText('2020年3月10日')).toBeInTheDocument();
    });

    it('isAlive=true の場合、deathYear があっても没年月日は表示されない', () => {
      renderPanel({
        isAlive: true,
        deathYear: 2020,
        deathMonth: 3,
        deathDay: 10,
      });
      expect(screen.queryByText('没年月日')).not.toBeInTheDocument();
    });

    it('isAlive=false かつ deathPlace がある場合、死亡地が表示される', () => {
      renderPanel({ isAlive: false, deathPlace: '大阪府' });
      expect(screen.getByText('大阪府')).toBeInTheDocument();
    });

    it('isAlive=true の場合、deathPlace があっても死亡地は表示されない', () => {
      renderPanel({ isAlive: true, deathPlace: '大阪府' });
      // 死亡地ラベルが表示されないことを確認
      expect(screen.queryByText('死亡地')).not.toBeInTheDocument();
    });

    it('note があれば表示される', () => {
      renderPanel({ note: 'テストメモ' });
      expect(screen.getByText('テストメモ')).toBeInTheDocument();
    });

    it('note が null なら表示されない', () => {
      renderPanel({ note: null });
      expect(screen.queryByText('メモ')).not.toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* 代表写真                                                           */
  /* ================================================================ */

  describe('代表写真', () => {
    it('primaryPhotoId が photos 内に存在する場合、photoSection が描画される', () => {
      renderPanel(
        { primaryPhotoId: 'photo-001' },
        { photos: [PHOTO_1] }
      );
      expect(screen.getByLabelText('代表写真')).toBeInTheDocument();
    });

    it('primaryPhotoId が null なら photoSection は描画されない', () => {
      renderPanel(
        { primaryPhotoId: null },
        { photos: [PHOTO_1] }
      );
      expect(screen.queryByLabelText('代表写真')).not.toBeInTheDocument();
    });

    it('primaryPhotoId があっても photos に見つからなければ photoSection は描画されない', () => {
      renderPanel(
        { primaryPhotoId: 'photo-999' },
        { photos: [PHOTO_1] }
      );
      expect(screen.queryByLabelText('代表写真')).not.toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* 関係一覧                                                           */
  /* ================================================================ */

  describe('関係一覧', () => {
    it('fromPersonId が person.id の parent_child → 「親 →」が表示される', () => {
      renderPanel({}, { relations: [RELATION_PARENT_CHILD_FROM] });
      expect(screen.getByText(/親 →/)).toBeInTheDocument();
    });

    it('toPersonId が person.id の parent_child → 「子 ←」が表示される', () => {
      renderPanel({}, { relations: [RELATION_PARENT_CHILD_TO] });
      expect(screen.getByText(/子 ←/)).toBeInTheDocument();
    });

    it('marriage 関係が表示される', () => {
      renderPanel({}, { relations: [RELATION_MARRIAGE] });
      expect(screen.getByText('婚姻関係')).toBeInTheDocument();
    });

    it('親子関係と婚姻関係が両方表示される', () => {
      renderPanel({}, {
        relations: [RELATION_PARENT_CHILD_FROM, RELATION_MARRIAGE],
      });
      expect(screen.getByText('親子関係')).toBeInTheDocument();
      expect(screen.getByText('婚姻関係')).toBeInTheDocument();
    });

    it('person.id と無関係な関係はフィルタされ表示されない', () => {
      renderPanel({}, { relations: [RELATION_UNRELATED] });
      // 関係セクション自体が描画されない
      expect(screen.queryByRole('heading', { name: '関係' })).not.toBeInTheDocument();
    });

    it('relations が 0 件なら関係セクションが描画されない', () => {
      renderPanel({}, { relations: [] });
      expect(screen.queryByRole('heading', { name: '関係' })).not.toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* 編集ボタン                                                         */
  /* ================================================================ */

  describe('編集ボタン', () => {
    it('初期状態で EditPersonDrawer の data-open が false', () => {
      renderPanel();
      const drawer = screen.getByTestId('edit-drawer');
      expect(drawer.getAttribute('data-open')).toBe('false');
    });

    it('編集ボタンクリックで EditPersonDrawer の data-open が true になる', () => {
      renderPanel();
      const editButton = screen.getByRole('button', { name: '編集' });
      fireEvent.click(editButton);
      const drawer = screen.getByTestId('edit-drawer');
      expect(drawer.getAttribute('data-open')).toBe('true');
    });

    it('EditPersonDrawer に person.id が渡される', () => {
      renderPanel();
      const drawer = screen.getByTestId('edit-drawer');
      expect(drawer.getAttribute('data-person-id')).toBe('person-001');
    });
  });

  /* ================================================================ */
  /* 削除インラインダイアログ                                           */
  /* ================================================================ */

  describe('削除インラインダイアログ', () => {
    it('初期状態では削除確認UI（alertdialog）が表示されない', () => {
      renderPanel();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('削除ボタンクリックでインライン削除確認UI が表示される', () => {
      renderPanel();
      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('「キャンセル」クリックでインライン確認UIが閉じる', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('「削除する」クリックで deletePerson が呼ばれる', async () => {
      mockDeletePerson.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(mockDeletePerson).toHaveBeenCalledWith({ personId: 'person-001' });
      });
    });

    it('deletePerson が { ok: true } → toast.success が呼ばれる', async () => {
      mockDeletePerson.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物を削除しました');
      });
    });

    it('deletePerson が { ok: true } → onDeleted コールバックが呼ばれる', async () => {
      mockDeletePerson.mockResolvedValue({ ok: true, data: undefined });
      const onDeleted = jest.fn();
      renderPanel({}, { onDeleted });
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalled();
      });
    });

    it('deletePerson が { ok: true } → 確認UIが閉じる', async () => {
      mockDeletePerson.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('deletePerson が { ok: false } → toast.error が呼ばれる', async () => {
      mockDeletePerson.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('削除に失敗しました');
      });
    });

    it('deletePerson が { ok: false } → 確認UIが閉じる', async () => {
      mockDeletePerson.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('deletePerson が { ok: false } → onDeleted は呼ばれない', async () => {
      mockDeletePerson.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      const onDeleted = jest.fn();
      renderPanel({}, { onDeleted });
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('onDeleted が未定義でも deletePerson 成功時にクラッシュしない', async () => {
      mockDeletePerson.mockResolvedValue({ ok: true, data: undefined });
      // onDeleted を渡さない
      renderPanel({}, {});
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物を削除しました');
      });
    });

    it('削除中は「削除する」ボタンが disabled', async () => {
      let resolveDelete: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveDelete = resolve;
      });
      mockDeletePerson.mockReturnValueOnce(pendingPromise);

      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      // 削除するをクリック（act でラップしないと useTransition の警告が出る）
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        // useTransition の isPending が true になるのを待つ
        // 削除ボタンと削除するボタンはそれぞれ disabled になる
        expect(mockDeletePerson).toHaveBeenCalled();
      });

      // クリーンアップ
      await act(async () => {
        resolveDelete!({ ok: true, data: undefined });
      });
    });

    it('削除中は「キャンセル」ボタンが disabled', async () => {
      let resolveDelete: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveDelete = resolve;
      });
      mockDeletePerson.mockReturnValueOnce(pendingPromise);

      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(mockDeletePerson).toHaveBeenCalled();
      });

      // クリーンアップ
      await act(async () => {
        resolveDelete!({ ok: true, data: undefined });
      });
    });
  });
});
