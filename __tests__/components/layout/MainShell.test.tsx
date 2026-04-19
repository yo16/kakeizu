/**
 * MainShell コンポーネントのテスト
 *
 * テスト観点:
 * - role="main" を持つ要素が存在すること
 * - children が描画されること
 * - AppHeader が子として描画されること（role="banner" を持つ要素の存在）
 * - ハンバーガートグルボタンのクリックで aria-expanded が切り替わること
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainShell } from '@/components/layout/MainShell';

describe('MainShell', () => {
  describe('基本レンダリング', () => {
    it('role="main" を持つ要素が存在すること', () => {
      render(<MainShell>コンテンツ</MainShell>);
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('children が描画されること', () => {
      render(<MainShell><span data-testid="child">子要素</span></MainShell>);
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  describe('AppHeader の描画', () => {
    it('role="banner" を持つ header 要素が描画されること', () => {
      render(<MainShell>コンテンツ</MainShell>);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('"メインナビゲーション" の nav が描画されること', () => {
      render(<MainShell>コンテンツ</MainShell>);
      expect(
        screen.getByRole('navigation', { name: 'メインナビゲーション' })
      ).toBeInTheDocument();
    });
  });

  describe('ハンバーガートグル', () => {
    it('初期状態でトグルボタンの aria-expanded が false であること', () => {
      render(<MainShell>コンテンツ</MainShell>);
      const toggleBtn = screen.getByRole('button', { name: 'メニューを開く' });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    });

    it('トグルボタンをクリックすると aria-expanded が true に切り替わること', async () => {
      const user = userEvent.setup();
      render(<MainShell>コンテンツ</MainShell>);
      const toggleBtn = screen.getByRole('button', { name: 'メニューを開く' });
      await user.click(toggleBtn);
      // aria-expanded が true になった後、aria-label も変わる
      expect(screen.getByRole('button', { name: 'メニューを閉じる' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });

    it('トグルボタンを2回クリックすると aria-expanded が false に戻ること', async () => {
      const user = userEvent.setup();
      render(<MainShell>コンテンツ</MainShell>);
      const toggleBtn = screen.getByRole('button', { name: 'メニューを開く' });
      await user.click(toggleBtn);
      await user.click(screen.getByRole('button', { name: 'メニューを閉じる' }));
      expect(screen.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });
  });
});
