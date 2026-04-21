/**
 * AppHeader コンポーネントのテスト
 *
 * テスト観点:
 * - role="banner" の header が存在すること
 * - <nav aria-label="メインナビゲーション"> が存在すること
 * - isNavOpen prop に応じて aria-expanded が true/false 切り替わること
 * - トグルクリックで onToggleNav が呼ばれること
 * - aria-label が isNavOpen に応じて「メニューを開く」/「メニューを閉じる」と切り替わること
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '@/components/layout/AppHeader';

describe('AppHeader', () => {
  describe('基本レンダリング', () => {
    it('role="banner" の header が存在すること', () => {
      render(<AppHeader isNavOpen={false} onToggleNav={() => {}} />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('<nav aria-label="メインナビゲーション"> が存在すること', () => {
      render(<AppHeader isNavOpen={false} onToggleNav={() => {}} />);
      expect(
        screen.getByRole('navigation', { name: 'メインナビゲーション' })
      ).toBeInTheDocument();
    });
  });

  describe('isNavOpen prop', () => {
    it('isNavOpen={false} のとき aria-expanded が "false" であること', () => {
      render(<AppHeader isNavOpen={false} onToggleNav={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('isNavOpen={true} のとき aria-expanded が "true" であること', () => {
      render(<AppHeader isNavOpen={true} onToggleNav={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('isNavOpen={false} のとき aria-label が "メニューを開く" であること', () => {
      render(<AppHeader isNavOpen={false} onToggleNav={() => {}} />);
      expect(screen.getByRole('button', { name: 'メニューを開く' })).toBeInTheDocument();
    });

    it('isNavOpen={true} のとき aria-label が "メニューを閉じる" であること', () => {
      render(<AppHeader isNavOpen={true} onToggleNav={() => {}} />);
      expect(screen.getByRole('button', { name: 'メニューを閉じる' })).toBeInTheDocument();
    });
  });

  describe('onToggleNav コールバック', () => {
    it('トグルボタンをクリックすると onToggleNav が1回呼ばれること', async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();
      render(<AppHeader isNavOpen={false} onToggleNav={handleToggle} />);
      await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it('トグルボタンを2回クリックすると onToggleNav が2回呼ばれること', async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();
      // isNavOpen は親から制御されるので常に false で固定してクリック回数を数える
      const { rerender } = render(<AppHeader isNavOpen={false} onToggleNav={handleToggle} />);
      await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
      rerender(<AppHeader isNavOpen={false} onToggleNav={handleToggle} />);
      await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
      expect(handleToggle).toHaveBeenCalledTimes(2);
    });
  });
});
