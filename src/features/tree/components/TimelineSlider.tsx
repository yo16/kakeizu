'use client';

/**
 * TimelineSlider
 *
 * tree-visualization-design.md §7 タイムライン連動 に準拠。
 * ツリーキャンバス下部に配置する年スライダー。
 *
 * - input[type=range] で currentYear を更新
 * - Zustand の currentYear / setCurrentYear / yearRange を購読
 * - アクセシビリティ: aria-label, aria-valuenow, aria-valuemin, aria-valuemax
 */

import React, { useCallback } from 'react';

import { useTreeEditorStore } from '../state/tree-editor-store';
import styles from './TimelineSlider.module.css';

export function TimelineSlider() {
  const currentYear = useTreeEditorStore((s) => s.currentYear);
  const setCurrentYear = useTreeEditorStore((s) => s.setCurrentYear);
  const yearRange = useTreeEditorStore((s) => s.yearRange);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentYear(Number(e.target.value));
    },
    [setCurrentYear]
  );

  const handleReset = useCallback(() => {
    setCurrentYear(null);
  }, [setCurrentYear]);

  // スライダーの表示値: currentYear が null の場合は yearRange.max を初期位置とする
  const sliderValue = currentYear ?? yearRange.max;

  return (
    <div className={styles.container} role="group" aria-label="タイムライン">
      <div className={styles.inner}>
        {/* 年ラベル表示 */}
        <div className={styles.yearDisplay}>
          {currentYear !== null ? (
            <span className={styles.yearCurrent} aria-live="polite">
              {currentYear}年
            </span>
          ) : (
            <span className={styles.yearPlaceholder}>年を選択</span>
          )}
        </div>

        {/* スライダー本体 */}
        <div className={styles.sliderWrapper}>
          <span className={styles.rangeLabel}>{yearRange.min}</span>
          <input
            type="range"
            className={styles.slider}
            min={yearRange.min}
            max={yearRange.max}
            step={1}
            value={sliderValue}
            onChange={handleChange}
            aria-label="年スライダー"
            aria-valuenow={sliderValue}
            aria-valuemin={yearRange.min}
            aria-valuemax={yearRange.max}
            aria-valuetext={`${sliderValue}年`}
          />
          <span className={styles.rangeLabel}>{yearRange.max}</span>
        </div>

        {/* リセットボタン */}
        {currentYear !== null && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleReset}
            aria-label="年フィルターをリセット"
          >
            リセット
          </button>
        )}
      </div>
    </div>
  );
}
