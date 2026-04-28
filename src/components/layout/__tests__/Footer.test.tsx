/**
 * Footer コンポーネントのテスト
 *
 * テスト観点:
 * - 利用規約リンクの href
 * - プライバシーポリシーリンクの href
 * - contentinfo role の存在
 * - コピーライト表示
 */

import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

describe('Footer', () => {
  it('contentinfo role を持つこと', () => {
    render(<Footer />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('利用規約リンクが /legal/terms を指すこと', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: '利用規約' });
    expect(link).toHaveAttribute('href', '/legal/terms');
  });

  it('プライバシーポリシーリンクが /legal/privacy を指すこと', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: 'プライバシーポリシー' });
    expect(link).toHaveAttribute('href', '/legal/privacy');
  });

  it('コピーライトが表示されること', () => {
    render(<Footer />);

    expect(screen.getByText(/kakeizu/)).toBeInTheDocument();
  });
});
