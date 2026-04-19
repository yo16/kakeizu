/**
 * Form コンポーネント群のテスト
 *
 * テスト観点:
 * - FormField: children を縦並びでレンダー
 * - FormLabel: required={true} でアスタリスク表示
 * - FormLabel: required={false} / 未指定でアスタリスクなし
 * - FormError: message={undefined} → null（何も描画しない）
 * - FormError: message="" → null（空文字でも非表示）
 * - FormError: message="エラー" → role="alert" で表示
 * - FormError: id prop が出力に反映される
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormField, FormLabel, FormError } from '@/components/ui/Form/Form';

describe('FormField', () => {
  it('children が描画される', () => {
    render(
      <FormField>
        <span data-testid="child-a">A</span>
        <span data-testid="child-b">B</span>
      </FormField>
    );
    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });

  it('div 要素としてレンダーされる', () => {
    const { container } = render(
      <FormField>
        <span>子要素</span>
      </FormField>
    );
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.firstChild?.nodeName).toBe('DIV');
  });
});

describe('FormLabel', () => {
  it('children のテキストが表示される', () => {
    render(<FormLabel>ラベル名</FormLabel>);
    expect(screen.getByText(/ラベル名/)).toBeInTheDocument();
  });

  it('required={true} のときアスタリスク (*) が表示される', () => {
    render(<FormLabel required>必須フィールド</FormLabel>);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('required={false} のときアスタリスクが表示されない', () => {
    render(<FormLabel required={false}>任意フィールド</FormLabel>);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('required 未指定のときアスタリスクが表示されない', () => {
    render(<FormLabel>フィールド</FormLabel>);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('htmlFor を渡すと label 要素に for 属性が反映される', () => {
    render(<FormLabel htmlFor="my-input">ラベル</FormLabel>);
    expect(screen.getByText(/ラベル/)).toHaveAttribute('for', 'my-input');
  });
});

describe('FormError', () => {
  it('message={undefined} のとき何も描画しない', () => {
    const { container } = render(<FormError message={undefined} />);
    // eslint-disable-next-line testing-library/no-container
    expect(container).toBeEmptyDOMElement();
  });

  it('message="" のとき何も描画しない', () => {
    const { container } = render(<FormError message="" />);
    // eslint-disable-next-line testing-library/no-container
    expect(container).toBeEmptyDOMElement();
  });

  it('message が設定されているとき role="alert" で表示される', () => {
    render(<FormError message="入力してください" />);
    expect(screen.getByRole('alert')).toHaveTextContent('入力してください');
  });

  it('id prop が出力に反映される', () => {
    render(<FormError message="エラー" id="name-error" />);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'name-error');
  });
});
