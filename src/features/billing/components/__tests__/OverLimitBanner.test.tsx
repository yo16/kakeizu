/**
 * OverLimitBanner コンポーネントのユニットテスト
 *
 * 上限超過バナーの表示・非表示、各 overage 情報の描画、
 * アクセシビリティ属性を検証する。
 */
import { render, screen } from '@testing-library/react';

import { OverLimitBanner, type OverageEntry } from '../OverLimitBanner';

describe('OverLimitBanner', () => {
  // ケース1: overages が空配列の場合は何も描画されない
  it('overages が空配列のとき何も描画されない', () => {
    const { container } = render(<OverLimitBanner overages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // ケース2: overages が 1 件 (tree) のとき警告タイトルが表示される
  it('overages が 1 件 (tree) のとき警告タイトルが表示される', () => {
    const overages: OverageEntry[] = [
      { resource: 'tree', current: 3, limit: 1 },
    ];
    render(<OverLimitBanner overages={overages} />);
    expect(screen.getByText('利用上限を超過しています')).toBeInTheDocument();
  });

  // ケース3: overages が 2 件 (tree, person) のとき両方表示される
  it('overages が 2 件 (tree, person) のとき両方のリソースが表示される', () => {
    const overages: OverageEntry[] = [
      { resource: 'tree', current: 3, limit: 1 },
      { resource: 'person', current: 10, limit: 5 },
    ];
    render(<OverLimitBanner overages={overages} />);
    expect(screen.getByText(/家系図/)).toBeInTheDocument();
    expect(screen.getByText(/人物/)).toBeInTheDocument();
  });

  // ケース4: 各 overage が「現在: X 件 / 上限: Y 件」の形式で表示される
  it('各 overage が current と limit を含む形式で表示される', () => {
    const overages: OverageEntry[] = [
      { resource: 'photo', current: 8, limit: 2 },
    ];
    render(<OverLimitBanner overages={overages} />);
    // listitem の textContent で写真・数値・単位が含まれることを確認
    const li = screen.getAllByRole('listitem')[0];
    expect(li.textContent).toMatch(/8/);
    expect(li.textContent).toMatch(/2/);
    expect(li.textContent).toMatch(/件/);
  });

  // ケース5: role="alert" が設定されている (アクセシビリティ)
  it('role="alert" が設定されている', () => {
    const overages: OverageEntry[] = [
      { resource: 'tree', current: 2, limit: 1 },
    ];
    render(<OverLimitBanner overages={overages} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
