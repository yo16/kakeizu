/**
 * Modal コンポーネントのテスト
 *
 * テスト観点:
 * - isOpen={false} で DOM にない
 * - isOpen={true} で role="dialog" / aria-modal / aria-labelledby が正しい
 * - Esc キーで onClose が呼ばれる
 * - overlay クリックで onClose が呼ばれる (closeOnOverlayClick=true)
 * - closeOnOverlayClick={false} のとき overlay クリックで onClose が呼ばれない
 * - 閉じるボタンクリックで onClose が呼ばれる
 * - title が h2 に表示される
 * - body スクロールロック (isOpen=true → hidden / close → 戻る)
 * - フォーカストラップ: Tab キーで末尾→先頭に循環
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/ui/Modal/Modal';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    title: 'テストモーダル',
    children: <p>モーダルの内容</p>,
  };
  return render(<Modal {...defaultProps} {...props} />);
}

describe('Modal', () => {
  describe('表示制御', () => {
    it('isOpen={false} のとき dialog が DOM にない', () => {
      renderModal({ isOpen: false });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('isOpen={true} のとき dialog が DOM にある', () => {
      renderModal({ isOpen: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('aria 属性', () => {
    it('role="dialog" が設定される', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria-modal="true" が設定される', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('aria-labelledby が title 要素の id を指している', () => {
      renderModal({ title: 'テストタイトル' });
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const titleEl = document.getElementById(labelledBy!);
      expect(titleEl).toHaveTextContent('テストタイトル');
    });
  });

  describe('title 表示', () => {
    it('title が h2 に表示される', () => {
      renderModal({ title: 'マイモーダル' });
      const h2 = screen.getByRole('heading', { level: 2 });
      expect(h2).toHaveTextContent('マイモーダル');
    });
  });

  describe('閉じる操作', () => {
    it('閉じるボタンクリックで onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderModal({ onClose });
      await user.click(screen.getByRole('button', { name: '閉じる' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Esc キー押下で onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderModal({ onClose });
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closeOnOverlayClick={true} のとき overlay クリックで onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderModal({ onClose, closeOnOverlayClick: true });
      // createPortal により overlay は document.body 直下に描画されるため
      // container ではなく document.body から取得する
      // eslint-disable-next-line testing-library/no-node-access
      const overlay = document.body.querySelector('[class*="overlay"]') as HTMLElement;
      expect(overlay).not.toBeNull();
      await user.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closeOnOverlayClick={false} のとき overlay クリックで onClose が呼ばれない', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderModal({ onClose, closeOnOverlayClick: false });
      // createPortal により overlay は document.body 直下に描画されるため
      // container ではなく document.body から取得する
      // eslint-disable-next-line testing-library/no-node-access
      const overlay = document.body.querySelector('[class*="overlay"]') as HTMLElement;
      expect(overlay).not.toBeNull();
      await user.click(overlay);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('body スクロールロック', () => {
    it('isOpen={true} のとき document.body.style.overflow が "hidden" になる', () => {
      renderModal({ isOpen: true });
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('isOpen が true → false になると overflow が戻る', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="テスト">
          <p>内容</p>
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={jest.fn()} title="テスト">
          <p>内容</p>
        </Modal>
      );
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });

  describe('フォーカストラップ', () => {
    it('Tab キーで末尾要素から最初の要素に循環する', async () => {
      const user = userEvent.setup();
      renderModal({
        children: (
          <>
            <button type="button" data-testid="first-btn">最初</button>
            <button type="button" data-testid="last-btn">最後</button>
          </>
        ),
      });

      // Modal が開いたとき最初の focusable にフォーカスが当たる
      const lastBtn = screen.getByTestId('last-btn');
      lastBtn.focus();
      expect(lastBtn).toHaveFocus();

      // 末尾でTabを押すと最初に戻る
      await user.tab();
      // 閉じるボタン含む focusables の最初にフォーカスが移動している
      const dialog = screen.getByRole('dialog');
      // eslint-disable-next-line testing-library/no-node-access
      const focusables = dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      expect(document.activeElement).toBe(focusables[0]);
    });
  });
});
