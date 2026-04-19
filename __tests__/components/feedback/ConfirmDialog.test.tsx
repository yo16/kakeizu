/**
 * ConfirmDialog コンポーネントのテスト
 *
 * テスト観点:
 * - isOpen={false} でダイアログ非表示
 * - isOpen={true} で表示、title と description がレンダーされる
 * - cancel ボタンクリックで onClose が呼ばれる
 * - confirm ボタンクリックで onConfirm が呼ばれる
 * - isLoading={true} で confirm ボタンが loading（aria-disabled）
 * - children prop で追加コンテンツが表示される
 * - confirmVariant="danger" で danger variant のスタイルが当たる（className に danger 含む）
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const defaultProps: React.ComponentProps<typeof ConfirmDialog> = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'テストタイトル',
    confirmLabel: '確認',
    cancelLabel: 'キャンセル',
  };
  return render(<ConfirmDialog {...defaultProps} {...props} />);
}

describe('ConfirmDialog', () => {
  describe('表示制御', () => {
    it('isOpen={false} のとき dialog が DOM にない', () => {
      renderDialog({ isOpen: false });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('isOpen={true} のとき dialog が DOM にある', () => {
      renderDialog({ isOpen: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('title が表示される', () => {
      renderDialog({ title: 'アカウントを削除しますか？' });
      expect(screen.getByText('アカウントを削除しますか？')).toBeInTheDocument();
    });

    it('description が表示される', () => {
      renderDialog({ description: 'この操作は取り消せません。' });
      expect(screen.getByText('この操作は取り消せません。')).toBeInTheDocument();
    });

    it('description が省略されたとき表示されない', () => {
      renderDialog({ description: undefined });
      // description テキストが存在しないことを確認（特定テキストがないことを確認）
      expect(screen.queryByText('この操作は取り消せません。')).toBeNull();
    });
  });

  describe('children', () => {
    it('children prop で追加コンテンツが表示される', () => {
      renderDialog({
        children: <input type="text" aria-label="追加入力" />,
      });
      expect(screen.getByRole('textbox', { name: '追加入力' })).toBeInTheDocument();
    });
  });

  describe('cancel ボタン', () => {
    it('cancel ボタンクリックで onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderDialog({ onClose, cancelLabel: 'キャンセル' });
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirm ボタン', () => {
    it('confirm ボタンクリックで onConfirm が呼ばれる', async () => {
      const user = userEvent.setup();
      const onConfirm = jest.fn();
      renderDialog({ onConfirm, confirmLabel: '確認' });
      await user.click(screen.getByRole('button', { name: '確認' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('isLoading={true} のとき confirm ボタンが aria-disabled になる', () => {
      renderDialog({ isLoading: true, confirmLabel: '確認' });
      const confirmButton = screen.getByRole('button', { name: '確認' });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('isLoading={true} のとき confirm ボタンをクリックしても onConfirm が呼ばれない', async () => {
      const user = userEvent.setup();
      const onConfirm = jest.fn();
      renderDialog({ isLoading: true, onConfirm, confirmLabel: '確認' });
      const confirmButton = screen.getByRole('button', { name: '確認' });
      await user.click(confirmButton);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('isConfirmDisabled={true} のとき confirm ボタンが disabled', () => {
      renderDialog({ isConfirmDisabled: true, confirmLabel: '確認' });
      const confirmButton = screen.getByRole('button', { name: '確認' });
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('confirmVariant', () => {
    it('confirmVariant="danger" のとき confirm ボタンの className に danger が含まれる', () => {
      renderDialog({ confirmVariant: 'danger', confirmLabel: '削除する' });
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      expect(confirmButton.className).toMatch(/danger/);
    });

    it('confirmVariant="primary" のとき confirm ボタンの className に primary が含まれる', () => {
      renderDialog({ confirmVariant: 'primary', confirmLabel: '確認' });
      const confirmButton = screen.getByRole('button', { name: '確認' });
      expect(confirmButton.className).toMatch(/primary/);
    });
  });
});
