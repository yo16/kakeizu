/**
 * TimelineSlider コンポーネントのテスト
 *
 * tree-visualization-design.md §7 タイムライン連動 に準拠した
 * 年スライダーの描画・操作・表示・範囲制限を検証する。
 */

import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineSlider } from '../TimelineSlider';
import { useTreeEditorStore } from '../../state/tree-editor-store';

/** 現在年 */
const CURRENT_YEAR = new Date().getFullYear();

/** store を初期状態に戻す */
function resetStore(overrides: Partial<{
  currentYear: number | null;
  yearRange: { min: number; max: number };
}> = {}) {
  act(() => {
    useTreeEditorStore.setState({
      selectedPersonId: null,
      hoveredPersonId: null,
      detailPanelOpen: false,
      currentYear: null,
      isUploading: false,
      yearRange: { min: 1900, max: CURRENT_YEAR },
      ...overrides,
    });
  });
}

describe('TimelineSlider', () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------
  describe('描画', () => {
    it('スライダー (input[type=range]) が描画されること', () => {
      render(<TimelineSlider />);

      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('aria-valuemin が yearRange.min と一致すること', () => {
      resetStore({ yearRange: { min: 1850, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuemin', '1850');
    });

    it('aria-valuemax が yearRange.max と一致すること', () => {
      resetStore({ yearRange: { min: 1850, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuemax', '2000');
    });

    it('currentYear が null の場合 aria-valuenow は yearRange.max になること', () => {
      resetStore({ currentYear: null, yearRange: { min: 1900, max: 2023 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '2023');
    });

    it('currentYear が設定されている場合 aria-valuenow は currentYear になること', () => {
      resetStore({ currentYear: 1980, yearRange: { min: 1900, max: CURRENT_YEAR } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '1980');
    });

    it('input の min 属性が yearRange.min と一致すること', () => {
      resetStore({ yearRange: { min: 1850, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('min', '1850');
    });

    it('input の max 属性が yearRange.max と一致すること', () => {
      resetStore({ yearRange: { min: 1850, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('max', '2000');
    });

    it('タイムラインを表すグループ (role=group) が描画されること', () => {
      render(<TimelineSlider />);

      expect(screen.getByRole('group', { name: 'タイムライン' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 現在年の表示
  // -------------------------------------------------------------------------
  describe('現在年の表示', () => {
    it('currentYear が設定されている場合は "{currentYear}年" が表示されること', () => {
      resetStore({ currentYear: 1980 });
      render(<TimelineSlider />);

      expect(screen.getByText('1980年')).toBeInTheDocument();
    });

    it('currentYear が null の場合は "年を選択" プレースホルダが表示されること', () => {
      resetStore({ currentYear: null });
      render(<TimelineSlider />);

      expect(screen.getByText('年を選択')).toBeInTheDocument();
    });

    it('currentYear が設定されている場合は aria-live="polite" の要素が存在すること', () => {
      resetStore({ currentYear: 2000 });
      render(<TimelineSlider />);

      const liveEl = screen.getByText('2000年');
      expect(liveEl).toHaveAttribute('aria-live', 'polite');
    });
  });

  // -------------------------------------------------------------------------
  // 操作: スライダー値変更
  // -------------------------------------------------------------------------
  describe('操作: スライダー値変更', () => {
    it('スライダーを操作すると store の currentYear が更新されること', () => {
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1990' } });

      expect(useTreeEditorStore.getState().currentYear).toBe(1990);
    });

    it('異なる年に変更した場合も store が更新されること', () => {
      resetStore({ yearRange: { min: 1800, max: 2100 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1850' } });

      expect(useTreeEditorStore.getState().currentYear).toBe(1850);
    });

    it('スライダー操作後に表示年が更新されること', () => {
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1975' } });

      expect(screen.getByText('1975年')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // リセットボタン
  // -------------------------------------------------------------------------
  describe('リセットボタン', () => {
    it('currentYear が null の場合はリセットボタンが表示されないこと', () => {
      resetStore({ currentYear: null });
      render(<TimelineSlider />);

      expect(screen.queryByRole('button', { name: '年フィルターをリセット' })).not.toBeInTheDocument();
    });

    it('currentYear が設定されている場合はリセットボタンが表示されること', () => {
      resetStore({ currentYear: 2000 });
      render(<TimelineSlider />);

      expect(screen.getByRole('button', { name: '年フィルターをリセット' })).toBeInTheDocument();
    });

    it('リセットボタンをクリックすると store の currentYear が null になること', () => {
      resetStore({ currentYear: 2000 });
      render(<TimelineSlider />);

      fireEvent.click(screen.getByRole('button', { name: '年フィルターをリセット' }));

      expect(useTreeEditorStore.getState().currentYear).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 範囲外操作: HTML 属性での制限確認
  // -------------------------------------------------------------------------
  describe('範囲外操作: HTML 属性での制限確認', () => {
    it('min 属性が yearRange.min 未満の値を受け付けないよう設定されること', () => {
      resetStore({ yearRange: { min: 1900, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      // HTML の min 属性で 1900 未満の値がブラウザ側で制限される
      expect(Number(slider.getAttribute('min'))).toBe(1900);
    });

    it('max 属性が yearRange.max 超過の値を受け付けないよう設定されること', () => {
      resetStore({ yearRange: { min: 1900, max: 2000 } });
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      // HTML の max 属性で 2000 超過の値がブラウザ側で制限される
      expect(Number(slider.getAttribute('max'))).toBe(2000);
    });

    it('step 属性が 1 に設定されていること (1年単位での操作)', () => {
      render(<TimelineSlider />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('step', '1');
    });
  });
});
