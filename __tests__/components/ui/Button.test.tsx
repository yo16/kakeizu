/**
 * Button コンポーネントのテスト
 *
 * テスト観点:
 * - variant / size の適用
 * - loading 状態: spinner 表示 / クリック無効
 * - disabled 状態: クリック無効
 * - type 属性のデフォルト値
 * - leftIcon / rightIcon の描画
 * - キーボードフォーカス
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button/Button';

describe('Button', () => {
  describe('基本レンダリング', () => {
    it('children が描画される', () => {
      render(<Button>送信</Button>);
      expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
    });

    it('type のデフォルトが "button" である', () => {
      render(<Button>OK</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('type="submit" が指定できる', () => {
      render(<Button type="submit">送信</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });
  });

  describe('variant', () => {
    it.each(['primary', 'secondary', 'danger', 'ghost'] as const)(
      'variant="%s" のクラス名がボタンに付与される',
      (variant) => {
        render(<Button variant={variant}>ボタン</Button>);
        const button = screen.getByRole('button');
        // CSS Modules は identity-obj-proxy によりキー名がそのままクラス名になる
        expect(button.className).toMatch(new RegExp(variant, 'i'));
      }
    );
  });

  describe('size', () => {
    it.each(['sm', 'md', 'lg'] as const)(
      'size="%s" のクラス名がボタンに付与される',
      (size) => {
        render(<Button size={size}>ボタン</Button>);
        const button = screen.getByRole('button');
        // CSS Modules は identity-obj-proxy によりキー名がそのままクラス名になる
        expect(button.className).toMatch(new RegExp(size, 'i'));
      }
    );
  });

  describe('loading', () => {
    it('loading={true} のとき spinner が DOM に存在する', () => {
      render(<Button loading>処理中</Button>);
      // spinner は aria-hidden="true" のため role では取得できないので querySelector を使用
      const button = screen.getByRole('button');
      // eslint-disable-next-line testing-library/no-node-access
      const spinner = button.querySelector('[aria-hidden="true"]');
      expect(spinner).toBeInTheDocument();
    });

    it('loading={true} のとき onClick が呼ばれない', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button loading onClick={handleClick}>処理中</Button>);
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('loading={true} のとき aria-disabled="true" が設定される', () => {
      render(<Button loading>処理中</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    });

    it('loading={true} のとき leftIcon は描画されない', () => {
      render(<Button loading leftIcon={<span data-testid="icon" />}>ボタン</Button>);
      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    });

    it('loading={true} のとき rightIcon は描画されない', () => {
      render(<Button loading rightIcon={<span data-testid="right-icon-loading" />}>ボタン</Button>);
      expect(screen.queryByTestId('right-icon-loading')).not.toBeInTheDocument();
    });
  });

  describe('disabled', () => {
    it('disabled={true} のとき onClick が呼ばれない', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button disabled onClick={handleClick}>ボタン</Button>);
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('disabled 属性が button 要素に反映される', () => {
      render(<Button disabled>ボタン</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('onClick', () => {
    it('クリックで onClick が呼ばれる', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>クリック</Button>);
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('leftIcon / rightIcon', () => {
    it('leftIcon が描画される', () => {
      render(<Button leftIcon={<span data-testid="left-icon" />}>ボタン</Button>);
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('rightIcon が描画される', () => {
      render(<Button rightIcon={<span data-testid="right-icon" />}>ボタン</Button>);
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('getByRole("button") でフォーカス可能な要素が取得できる', () => {
      render(<Button>フォーカス</Button>);
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });
  });
});
