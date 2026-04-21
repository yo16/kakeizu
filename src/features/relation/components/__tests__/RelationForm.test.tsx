/**
 * RelationForm コンポーネントのテスト
 *
 * テスト観点:
 * - kind='parent_child': ParentChildForm の表示・バリデーション・送信
 * - kind='marriage': MarriageForm の表示・バリデーション・送信
 * - PersonSearchCombobox: 検索・選択・除外・キーボード操作
 * - mode='create' / 'edit' 切り替え
 * - サーバーエラーハンドリング
 * - 送信中の状態
 */

// Server Actions をモック
jest.mock('@/features/relation/actions', () => ({
  createParentChild: jest.fn(),
  createMarriage: jest.fn(),
  updateRelation: jest.fn(),
}));

// useToast をモック
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    show: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RelationForm } from '../RelationForm';
import { createParentChild, createMarriage, updateRelation } from '@/features/relation/actions';
import type { PersonSummary } from '@/features/person/actions';

const mockCreateParentChild = createParentChild as jest.MockedFunction<typeof createParentChild>;
const mockCreateMarriage = createMarriage as jest.MockedFunction<typeof createMarriage>;
const mockUpdateRelation = updateRelation as jest.MockedFunction<typeof updateRelation>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const FROM_PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TO_PERSON_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const RELATION_ID = 'cccccccc-0000-0000-0000-000000000003';
const TREE_ID = 'dddddddd-0000-0000-0000-000000000004';

const PERSONS: PersonSummary[] = [
  { id: TO_PERSON_ID, displayName: '田中 花子', birthYear: 1985, gender: 'female' },
  { id: 'eeeeeeee-0000-0000-0000-000000000005', displayName: '山田 次郎', birthYear: 1990, gender: 'male' },
  { id: 'ffffffff-0000-0000-0000-000000000006', displayName: '鈴木 一郎', birthYear: null, gender: null },
];

/* ------------------------------------------------------------------ */
/* テスト: kind='parent_child'                                          */
/* ------------------------------------------------------------------ */

describe('RelationForm (kind=parent_child)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 初期表示
  // ------------------------------------------------------------------
  describe('初期表示', () => {
    it('toPersonId 未指定 → PersonSearchCombobox が表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
        />
      );
      expect(screen.getByPlaceholderText('名前で検索...')).toBeInTheDocument();
    });

    it('toPersonId 指定済み → PersonSearchCombobox が表示されない', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
        />
      );
      expect(screen.queryByPlaceholderText('名前で検索...')).not.toBeInTheDocument();
    });

    it('parentRole セレクトに biological/adoptive/step の3オプションが表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
        />
      );
      expect(screen.getByRole('option', { name: '生物学的親' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '養親' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '継親' })).toBeInTheDocument();
    });

    it('note textarea が表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
        />
      );
      expect(screen.getByPlaceholderText('自由記述（1000文字以内）')).toBeInTheDocument();
    });

    it('onCancel が渡されていればキャンセルボタンが表示される', () => {
      const onCancel = jest.fn();
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          onCancel={onCancel}
        />
      );
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('onCancel が渡されていなければキャンセルボタンが表示されない', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
        />
      );
      expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 正常系: create
  // ------------------------------------------------------------------
  describe('正常系 (mode=create)', () => {
    it('人物選択 + parentRole 指定で submit → createParentChild が正しい引数で呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      // parentRole を変更
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'adoptive' } });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(mockCreateParentChild).toHaveBeenCalledWith(
          expect.objectContaining({
            parentId: FROM_PERSON_ID,
            childId: TO_PERSON_ID,
            parentRole: 'adoptive',
          })
        );
      });
    });

    it('note 空 → 引数に note: undefined で呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(mockCreateParentChild).toHaveBeenCalledWith(
          expect.objectContaining({ note: undefined })
        );
      });
    });

    it('成功時: toast.success("追加しました") が呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('追加しました');
      });
    });

    it('成功時: onSuccess が relationId / kind で呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });
      const onSuccess = jest.fn();

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
          onSuccess={onSuccess}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          relationId: RELATION_ID,
          kind: 'parent_child',
        });
      });
    });
  });

  // ------------------------------------------------------------------
  // バリデーションエラー
  // ------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('人物未選択で submit → toPersonId バリデーションエラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('相手の人物を選択してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateParentChild).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // サーバーエラー
  // ------------------------------------------------------------------
  describe('サーバーエラーハンドリング', () => {
    it('field あり → フィールドエラーが表示される', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', field: 'parentRole', message: '親の役割が不正です' },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('親の役割が不正です')[0]).toBeInTheDocument();
      });
    });

    it('field なし → root エラーが表示され toast.error が呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'サーバーエラーが発生しました' },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
        expect(mockToastError).toHaveBeenCalledWith('サーバーエラーが発生しました');
      });
    });
  });

  // ------------------------------------------------------------------
  // mode='edit'
  // ------------------------------------------------------------------
  describe('mode=edit', () => {
    it('updateRelation が正しい引数で呼ばれる', async () => {
      mockUpdateRelation.mockResolvedValue({ ok: true, data: undefined });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="edit"
          defaultValues={{ relationId: RELATION_ID, parentRole: 'biological' }}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'step' } });

      fireEvent.click(screen.getByRole('button', { name: '更新する' }));

      await waitFor(() => {
        expect(mockUpdateRelation).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'parent_child',
            relationId: RELATION_ID,
            parentRole: 'step',
          })
        );
      });
    });

    it('成功時: toast.success("更新しました") が呼ばれる', async () => {
      mockUpdateRelation.mockResolvedValue({ ok: true, data: undefined });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="edit"
          defaultValues={{ relationId: RELATION_ID, parentRole: 'biological' }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '更新する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('更新しました');
      });
    });
  });

  // ------------------------------------------------------------------
  // 送信中の状態
  // ------------------------------------------------------------------
  describe('送信中の状態', () => {
    it('送信中はボタンが disabled になる', async () => {
      mockCreateParentChild.mockImplementation(() => new Promise(() => {}));

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="parent_child"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '追加する' })).toBeDisabled();
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/* テスト: kind='marriage'                                              */
/* ------------------------------------------------------------------ */

describe('RelationForm (kind=marriage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 初期表示
  // ------------------------------------------------------------------
  describe('初期表示', () => {
    it('marriageType に spouse/common_law/same_sex_partner が表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
        />
      );
      expect(screen.getByRole('option', { name: '配偶者' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '事実婚' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '同性パートナー' })).toBeInTheDocument();
    });

    it('marriageStatus に current/divorced/widowed が表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
        />
      );
      expect(screen.getByRole('option', { name: '現在' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '離婚' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '死別' })).toBeInTheDocument();
    });

    it('開始年月・終了年月 input が表示される', () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
        />
      );
      expect(screen.getByLabelText('年', { selector: '#startYear' })).toBeInTheDocument();
      expect(screen.getByLabelText('月', { selector: '#startMonth' })).toBeInTheDocument();
      expect(screen.getByLabelText('年', { selector: '#endYear' })).toBeInTheDocument();
      expect(screen.getByLabelText('月', { selector: '#endMonth' })).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 正常系: create
  // ------------------------------------------------------------------
  describe('正常系 (mode=create)', () => {
    it('送信で createMarriage が正しい引数で呼ばれる', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(mockCreateMarriage).toHaveBeenCalledWith(
          expect.objectContaining({
            partnerAId: FROM_PERSON_ID,
            partnerBId: TO_PERSON_ID,
            type: 'spouse',
            status: 'current',
          })
        );
      });
    });

    it('成功時: toast.success("追加しました") が呼ばれる', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('追加しました');
      });
    });

    it('成功時: onSuccess が relationId / kind で呼ばれる', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });
      const onSuccess = jest.fn();

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
          onSuccess={onSuccess}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          relationId: RELATION_ID,
          kind: 'marriage',
        });
      });
    });
  });

  // ------------------------------------------------------------------
  // バリデーションエラー
  // ------------------------------------------------------------------
  describe('バリデーションエラー', () => {
    it('endYear < startYear で submit → 「終了年は開始年以降を入力してください」エラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.change(screen.getByLabelText('年', { selector: '#startYear' }), {
        target: { value: '2020' },
      });
      fireEvent.change(screen.getByLabelText('年', { selector: '#endYear' }), {
        target: { value: '2010' },
      });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('終了年は開始年以降を入力してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateMarriage).not.toHaveBeenCalled();
    });

    it('startYear が 1000 未満 → バリデーションエラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.change(screen.getByLabelText('年', { selector: '#startYear' }), {
        target: { value: '999' },
      });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('1000年以降を入力してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateMarriage).not.toHaveBeenCalled();
    });

    it('startYear が 9999 超 → バリデーションエラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.change(screen.getByLabelText('年', { selector: '#startYear' }), {
        target: { value: '10000' },
      });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('9999年以前を入力してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateMarriage).not.toHaveBeenCalled();
    });

    it('startMonth が 1 未満 → バリデーションエラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.change(screen.getByLabelText('月', { selector: '#startMonth' }), {
        target: { value: '0' },
      });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('1〜12 の範囲で入力してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateMarriage).not.toHaveBeenCalled();
    });

    it('startMonth が 12 超 → バリデーションエラーが表示される', async () => {
      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="create"
        />
      );

      fireEvent.change(screen.getByLabelText('月', { selector: '#startMonth' }), {
        target: { value: '13' },
      });

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(screen.getAllByText('1〜12 の範囲で入力してください')[0]).toBeInTheDocument();
      });
      expect(mockCreateMarriage).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // mode='edit'
  // ------------------------------------------------------------------
  describe('mode=edit', () => {
    it('updateRelation が正しい引数で呼ばれる', async () => {
      mockUpdateRelation.mockResolvedValue({ ok: true, data: undefined });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="edit"
          defaultValues={{
            relationId: RELATION_ID,
            marriageType: 'spouse',
            marriageStatus: 'current',
          }}
        />
      );

      // marriageType を変更
      const selects = screen.getAllByRole('combobox');
      // selects[0] = marriageType, selects[1] = marriageStatus
      fireEvent.change(selects[0], { target: { value: 'common_law' } });

      fireEvent.click(screen.getByRole('button', { name: '更新する' }));

      await waitFor(() => {
        expect(mockUpdateRelation).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'marriage',
            relationId: RELATION_ID,
            type: 'common_law',
          })
        );
      });
    });

    it('成功時: toast.success("更新しました") が呼ばれる', async () => {
      mockUpdateRelation.mockResolvedValue({ ok: true, data: undefined });

      render(
        <RelationForm
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          toPersonId={TO_PERSON_ID}
          persons={PERSONS}
          kind="marriage"
          mode="edit"
          defaultValues={{
            relationId: RELATION_ID,
            marriageType: 'spouse',
            marriageStatus: 'current',
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '更新する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('更新しました');
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/* テスト: PersonSearchCombobox                                         */
/* ------------------------------------------------------------------ */

describe('PersonSearchCombobox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期表示: input が空、listbox 非表示', () => {
    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={PERSONS}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('input に文字入力 → listbox に displayName 部分一致の人物が表示される', () => {
    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={PERSONS}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: '田中' } });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('田中 花子')).toBeInTheDocument();
  });

  it('該当なし → 「該当する人物が見つかりません」が表示される', () => {
    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={PERSONS}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: 'xxxxxxxxxx' } });

    expect(screen.getByText('該当する人物が見つかりません')).toBeInTheDocument();
  });

  it('オプションクリック → input に displayName がセット、listbox が閉じる', () => {
    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={PERSONS}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: '田中' } });

    fireEvent.click(screen.getByText('田中 花子'));

    expect(input).toHaveValue('田中 花子');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('excludeId と同じ id の人物は除外される', () => {
    // FROM_PERSON_ID と同じ id の人物を persons に追加して、excludeId として効くか確認
    const personsWithFromPerson: PersonSummary[] = [
      ...PERSONS,
      { id: FROM_PERSON_ID, displayName: '除外すべき人物', birthYear: null, gender: null },
    ];

    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={personsWithFromPerson}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: '除外' } });

    expect(screen.queryByText('除外すべき人物')).not.toBeInTheDocument();
    expect(screen.getByText('該当する人物が見つかりません')).toBeInTheDocument();
  });

  it('最大20件に制限される', () => {
    // 21件の人物を用意
    const manyPersons: PersonSummary[] = Array.from({ length: 21 }, (_, i) => ({
      id: `person-${i.toString().padStart(2, '0')}-0000-0000-0000-000000000000`.slice(0, 36),
      displayName: `テスト人物${i + 1}`,
      birthYear: null,
      gender: null,
    }));

    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={manyPersons}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: 'テスト' } });

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(20);
  });

  it('ArrowDown で最初のオプションにフォーカスが移る', () => {
    render(
      <RelationForm
        treeId={TREE_ID}
        fromPersonId={FROM_PERSON_ID}
        persons={PERSONS}
        kind="parent_child"
        mode="create"
      />
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.change(input, { target: { value: '田中' } });

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);
  });
});
