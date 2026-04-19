/**
 * Input コンポーネントのテスト
 *
 * テスト観点:
 * - label prop でラベル生成 + label-input の紐付け
 * - ユーザー入力で値が反映される
 * - error prop でエラーメッセージ表示 + aria-invalid
 * - aria-describedby が error element の id を指す
 * - hint: error なし→表示、error あり→非表示
 * - disabled の反映
 * - forwardRef の動作
 */

import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/Input/Input';

describe('Input', () => {
  describe('label', () => {
    it('label prop でラベルが表示される', () => {
      render(<Input label="メールアドレス" />);
      expect(screen.getByText('メールアドレス')).toBeInTheDocument();
    });

    it('getByLabelText で input を取得できる（label-input の紐付け）', () => {
      render(<Input label="名前" />);
      expect(screen.getByLabelText('名前')).toBeInTheDocument();
    });

    it('label が未指定のとき label 要素が描画されない', () => {
      const { container } = render(<Input />);
      // <label> 要素には ARIA role が存在しないため container.querySelector で確認する
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      expect(container.querySelector('label')).toBeNull();
    });
  });

  describe('ユーザー入力', () => {
    it('userEvent.type で入力値が反映される', async () => {
      const user = userEvent.setup();
      render(<Input label="テキスト" />);
      const input = screen.getByLabelText('テキスト');
      await user.type(input, 'hello');
      expect(input).toHaveValue('hello');
    });
  });

  describe('error', () => {
    it('error prop でエラーメッセージが表示される', () => {
      render(<Input label="名前" error="入力してください" />);
      expect(screen.getByText('入力してください')).toBeInTheDocument();
    });

    it('error prop で aria-invalid="true" が設定される', () => {
      render(<Input label="名前" error="エラー" />);
      expect(screen.getByLabelText('名前')).toHaveAttribute('aria-invalid', 'true');
    });

    it('error がないとき aria-invalid が設定されない', () => {
      render(<Input label="名前" />);
      expect(screen.getByLabelText('名前')).not.toHaveAttribute('aria-invalid');
    });

    it('aria-describedby が error 要素の id を指している', () => {
      render(<Input label="名前" error="エラー" id="name-input" />);
      const input = screen.getByLabelText('名前');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      // aria-describedby で指定された id の要素が DOM にある
      const errorEl = document.getElementById(describedBy!);
      expect(errorEl).toBeInTheDocument();
      expect(errorEl).toHaveTextContent('エラー');
    });

    it('error がないとき aria-describedby が設定されない', () => {
      render(<Input label="名前" />);
      expect(screen.getByLabelText('名前')).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('hint', () => {
    it('error がないとき hint が表示される', () => {
      render(<Input label="名前" hint="半角英数字で入力" />);
      expect(screen.getByText('半角英数字で入力')).toBeInTheDocument();
    });

    it('error があるとき hint が非表示になる', () => {
      render(<Input label="名前" hint="半角英数字で入力" error="エラー" />);
      expect(screen.queryByText('半角英数字で入力')).not.toBeInTheDocument();
    });
  });

  describe('disabled', () => {
    it('disabled が input 要素に反映される', () => {
      render(<Input label="名前" disabled />);
      expect(screen.getByLabelText('名前')).toBeDisabled();
    });
  });

  describe('leftAddon / rightAddon', () => {
    it('leftAddon を渡すと内容が描画される', () => {
      render(<Input label="検索" leftAddon={<span data-testid="left-addon">@</span>} />);
      expect(screen.getByTestId('left-addon')).toBeInTheDocument();
    });

    it('rightAddon を渡すと内容が描画される', () => {
      render(<Input label="金額" rightAddon={<span data-testid="right-addon">円</span>} />);
      expect(screen.getByTestId('right-addon')).toBeInTheDocument();
    });
  });

  describe('forwardRef', () => {
    it('useRef 経由で input 要素にアクセスできる', () => {
      const ref = createRef<HTMLInputElement>();
      render(<Input label="名前" ref={ref} />);
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe('INPUT');
    });
  });
});
