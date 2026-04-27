'use client';

/**
 * treeEditorStore — ツリー編集画面のグローバル状態
 *
 * frontend-design.md §3 Zustand store (`treeEditorStore`) に準拠。
 * tree-visualization-design.md §7 タイムライン連動 の currentYear を含む。
 */

import { create } from 'zustand';

export interface TreeEditorState {
  /** 選択中の人物 ID (null = 未選択) */
  selectedPersonId: string | null;
  /** ホバー中の人物 ID (null = なし) */
  hoveredPersonId: string | null;
  /** 詳細パネルの開閉状態 */
  detailPanelOpen: boolean;
  /** タイムライン: 現在選択中の年 (null = 未選択) */
  currentYear: number | null;
  /** 写真アップロード中フラグ */
  isUploading: boolean;
  /** 年の範囲 (persons の生年/没年から計算) */
  yearRange: { min: number; max: number };

  // Actions
  selectPerson: (id: string | null) => void;
  setHoveredPerson: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setCurrentYear: (y: number | null) => void;
  setIsUploading: (uploading: boolean) => void;
  setYearRange: (range: { min: number; max: number }) => void;
}

const CURRENT_YEAR = new Date().getFullYear();

export const useTreeEditorStore = create<TreeEditorState>((set) => ({
  selectedPersonId: null,
  hoveredPersonId: null,
  detailPanelOpen: false,
  currentYear: null,
  isUploading: false,
  yearRange: { min: 1900, max: CURRENT_YEAR },

  selectPerson: (id) =>
    set((state) => ({
      selectedPersonId: id,
      detailPanelOpen: id !== null ? true : state.detailPanelOpen,
    })),

  setHoveredPerson: (id) => set({ hoveredPersonId: id }),

  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  setCurrentYear: (y) => set({ currentYear: y }),

  setIsUploading: (uploading) => set({ isUploading: uploading }),

  setYearRange: (range) => set({ yearRange: range }),
}));
