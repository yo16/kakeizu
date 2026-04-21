/**
 * AddRelationDialog コンポーネントのテスト
 *
 * テスト観点:
 * - isOpen による Modal 表示/非表示
 * - 関係種別 radio (親子 / 婚姻) とデフォルト選択
 * - 種別変更でフォームが切り替わる
 * - 種別変更で form state がリセットされる (key={kind} の動作)
 * - 関係作成成功 → onSuccess / onClose が呼ばれる
 * - onClose prop で閉じる
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
import { AddRelationDialog } from '../AddRelationDialog';
import { createParentChild, createMarriage } from '@/features/relation/actions';
import type { PersonSummary } from '@/features/person/actions';

const mockCreateParentChild = createParentChild as jest.MockedFunction<typeof createParentChild>;
const mockCreateMarriage = createMarriage as jest.MockedFunction<typeof createMarriage>;

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
];

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

interface RenderDialogOptions {
  isOpen?: boolean;
  onClose?: jest.Mock;
  onSuccess?: jest.Mock;
}

function renderDialog({
  isOpen = true,
  onClose = jest.fn(),
  onSuccess = jest.fn(),
}: RenderDialogOptions = {}) {
  return render(
    <AddRelationDialog
      isOpen={isOpen}
      onClose={onClose}
      treeId={TREE_ID}
      fromPersonId={FROM_PERSON_ID}
      persons={PERSONS}
      onSuccess={onSuccess}
    />
  );
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('AddRelationDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 表示制御
  // ------------------------------------------------------------------
  describe('表示制御', () => {
    it('isOpen=false → Modal が表示されない', () => {
      renderDialog({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('isOpen=true → Modal が表示される', () => {
      renderDialog({ isOpen: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpen=true → タイトル「関係を追加」が表示される', () => {
      renderDialog({ isOpen: true });
      expect(screen.getByText('関係を追加')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 関係種別 radio
  // ------------------------------------------------------------------
  describe('関係種別 radio', () => {
    it('デフォルトで「親子関係」が選択されている', () => {
      renderDialog();
      const parentChildRadio = screen.getByRole('radio', { name: /親子関係/ });
      expect(parentChildRadio).toBeChecked();
    });

    it('デフォルトで「婚姻関係」が選択されていない', () => {
      renderDialog();
      const marriageRadio = screen.getByRole('radio', { name: /婚姻関係/ });
      expect(marriageRadio).not.toBeChecked();
    });

    it('「婚姻関係」を選択 → MarriageForm のフィールド (婚姻種別) が表示される', () => {
      renderDialog();
      const marriageRadio = screen.getByRole('radio', { name: /婚姻関係/ });
      fireEvent.click(marriageRadio);

      expect(screen.getByRole('option', { name: '配偶者' })).toBeInTheDocument();
    });

    it('「婚姻関係」を選択後「親子関係」に戻す → ParentChildForm のフィールド (生物学的親) が表示される', () => {
      renderDialog();
      const marriageRadio = screen.getByRole('radio', { name: /婚姻関係/ });
      fireEvent.click(marriageRadio);

      const parentChildRadio = screen.getByRole('radio', { name: /親子関係/ });
      fireEvent.click(parentChildRadio);

      expect(screen.getByRole('option', { name: '生物学的親' })).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 種別変更で form state がリセットされる
  // ------------------------------------------------------------------
  describe('種別変更で form がリセットされる', () => {
    it('PersonSearchCombobox に文字を入力後、種別変更 → 入力がリセットされる', () => {
      renderDialog();

      const input = screen.getByPlaceholderText('名前で検索...');
      fireEvent.change(input, { target: { value: '田中' } });
      expect(input).toHaveValue('田中');

      // 婚姻関係に切り替え
      const marriageRadio = screen.getByRole('radio', { name: /婚姻関係/ });
      fireEvent.click(marriageRadio);

      // 再び親子関係に切り替え
      const parentChildRadio = screen.getByRole('radio', { name: /親子関係/ });
      fireEvent.click(parentChildRadio);

      // フォームがリセットされ、再び空の input が表示される
      const newInput = screen.getByPlaceholderText('名前で検索...');
      expect(newInput).toHaveValue('');
    });
  });

  // ------------------------------------------------------------------
  // 関係作成成功
  // ------------------------------------------------------------------
  describe('関係作成成功', () => {
    it('親子関係作成成功 → onSuccess が relationId / kind で呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });
      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <AddRelationDialog
          isOpen={true}
          onClose={onClose}
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          persons={PERSONS}
          onSuccess={onSuccess}
        />
      );

      // PersonSearchCombobox で人物を選択
      const input = screen.getByPlaceholderText('名前で検索...');
      fireEvent.change(input, { target: { value: '田中' } });
      fireEvent.click(screen.getByText('田中 花子'));

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          relationId: RELATION_ID,
          kind: 'parent_child',
        });
      });
    });

    it('親子関係作成成功 → onClose が呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });
      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <AddRelationDialog
          isOpen={true}
          onClose={onClose}
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          persons={PERSONS}
          onSuccess={onSuccess}
        />
      );

      // PersonSearchCombobox で人物を選択
      const input = screen.getByPlaceholderText('名前で検索...');
      fireEvent.change(input, { target: { value: '田中' } });
      fireEvent.click(screen.getByText('田中 花子'));

      fireEvent.click(screen.getByRole('button', { name: '追加する' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('婚姻関係作成成功 → onSuccess が relationId / kind で呼ばれる', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: true,
        data: { relationId: RELATION_ID },
      });
      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <AddRelationDialog
          isOpen={true}
          onClose={onClose}
          treeId={TREE_ID}
          fromPersonId={FROM_PERSON_ID}
          persons={PERSONS}
          onSuccess={onSuccess}
        />
      );

      // 婚姻関係に切り替え
      const marriageRadio = screen.getByRole('radio', { name: /婚姻関係/ });
      fireEvent.click(marriageRadio);

      // PersonSearchCombobox で人物を選択
      const input = screen.getByPlaceholderText('名前で検索...');
      fireEvent.change(input, { target: { value: '田中' } });
      fireEvent.click(screen.getByText('田中 花子'));

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
  // onClose で閉じる
  // ------------------------------------------------------------------
  describe('onClose', () => {
    it('キャンセルボタンクリック → onClose が呼ばれる', () => {
      const onClose = jest.fn();
      renderDialog({ onClose });

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onClose).toHaveBeenCalled();
    });

    it('ダイアログの閉じるボタン (✕) クリック → onClose が呼ばれる', () => {
      const onClose = jest.fn();
      renderDialog({ onClose });

      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

      expect(onClose).toHaveBeenCalled();
    });
  });
});
