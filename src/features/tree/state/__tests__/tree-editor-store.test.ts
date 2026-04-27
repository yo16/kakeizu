/**
 * treeEditorStore のテスト
 *
 * Zustand store の currentYear / yearRange 周りの動作を検証する。
 * kakeizu-rgs.1 タイムライン連動に関するアクションを中心にカバーする。
 */

import { act } from 'react';
import { useTreeEditorStore } from '../tree-editor-store';

/** 現在年 */
const CURRENT_YEAR = new Date().getFullYear();

describe('treeEditorStore', () => {
  // テストごとに store を初期状態にリセット
  beforeEach(() => {
    act(() => {
      useTreeEditorStore.setState({
        selectedPersonId: null,
        hoveredPersonId: null,
        detailPanelOpen: false,
        currentYear: null,
        isUploading: false,
        yearRange: { min: 1900, max: CURRENT_YEAR },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 初期状態
  // -------------------------------------------------------------------------
  describe('初期状態', () => {
    it('currentYear の初期値は null であること', () => {
      const state = useTreeEditorStore.getState();

      expect(state.currentYear).toBeNull();
    });

    it('yearRange の初期値は { min: 1900, max: 現在年 } であること', () => {
      const state = useTreeEditorStore.getState();

      expect(state.yearRange).toEqual({ min: 1900, max: CURRENT_YEAR });
    });
  });

  // -------------------------------------------------------------------------
  // setCurrentYear アクション
  // -------------------------------------------------------------------------
  describe('setCurrentYear', () => {
    it('数値を渡すと currentYear が更新されること', () => {
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(1980);
      });

      expect(useTreeEditorStore.getState().currentYear).toBe(1980);
    });

    it('null を渡すと currentYear が null にリセットされること', () => {
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(2000);
      });
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(null);
      });

      expect(useTreeEditorStore.getState().currentYear).toBeNull();
    });

    it('連続して setCurrentYear を呼び出した場合、最後の値が反映されること', () => {
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(1990);
      });
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(2010);
      });

      expect(useTreeEditorStore.getState().currentYear).toBe(2010);
    });
  });

  // -------------------------------------------------------------------------
  // setYearRange アクション
  // -------------------------------------------------------------------------
  describe('setYearRange', () => {
    it('yearRange を更新できること', () => {
      act(() => {
        useTreeEditorStore.getState().setYearRange({ min: 1850, max: 2000 });
      });

      expect(useTreeEditorStore.getState().yearRange).toEqual({ min: 1850, max: 2000 });
    });

    it('yearRange を更新しても他の state は変化しないこと', () => {
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(1975);
      });
      act(() => {
        useTreeEditorStore.getState().setYearRange({ min: 1900, max: 2050 });
      });

      expect(useTreeEditorStore.getState().currentYear).toBe(1975);
      expect(useTreeEditorStore.getState().yearRange).toEqual({ min: 1900, max: 2050 });
    });
  });

  // -------------------------------------------------------------------------
  // 他のアクションとの独立性
  // -------------------------------------------------------------------------
  describe('他のアクションとの独立性', () => {
    it('selectPerson を呼び出しても currentYear は変化しないこと', () => {
      act(() => {
        useTreeEditorStore.getState().setCurrentYear(1985);
      });
      act(() => {
        useTreeEditorStore.getState().selectPerson('person-001');
      });

      expect(useTreeEditorStore.getState().currentYear).toBe(1985);
    });
  });
});
