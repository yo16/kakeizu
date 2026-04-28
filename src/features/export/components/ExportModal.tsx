'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import { useToast } from '@/components/ui/Toast/ToastProvider';
import { logger } from '@/lib/logger';

import { buildExportFileName, downloadBlob } from '../lib/download';
import { exportTreeAsPdf, exportTreeAsPng } from '../lib/exporter';
import type { ExportFormat, Orientation, PaperSize } from '../types';

import styles from './ExportModal.module.css';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** キャプチャ対象の要素を返すコールバック (モーダル開いた時点で評価) */
  getTargetElement: () => HTMLElement | SVGElement | null;
  treeTitle?: string | null;
}

export function ExportModal({
  isOpen,
  onClose,
  getTargetElement,
  treeTitle,
}: ExportModalProps): React.ReactElement {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  const isPdf = format === 'pdf';

  const handleExport = async (): Promise<void> => {
    const target = getTargetElement();
    if (!target) {
      toast.error('エクスポート対象が見つかりません');
      return;
    }

    setIsExporting(true);
    try {
      const blob =
        format === 'png'
          ? await exportTreeAsPng(target)
          : await exportTreeAsPdf(target, { paperSize, orientation });
      const fileName = buildExportFileName(treeTitle, format);
      downloadBlob(blob, fileName);
      toast.success(`${format.toUpperCase()} を出力しました`);
      onClose();
    } catch (error) {
      logger.error('[ExportModal] export failed:', error);
      toast.error('エクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="家系図をエクスポート" size="md">
      <div className={styles.container}>
        <fieldset className={styles.fieldset} disabled={isExporting}>
          <legend className={styles.legend}>フォーマット</legend>
          <div className={styles.radioGroup}>
            <label className={styles.radio}>
              <input
                type="radio"
                name="format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
              />
              PDF
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="format"
                value="png"
                checked={format === 'png'}
                onChange={() => setFormat('png')}
              />
              PNG
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={!isPdf || isExporting}>
          <legend className={styles.legend}>用紙サイズ</legend>
          <select
            className={styles.select}
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as PaperSize)}
            aria-label="用紙サイズ"
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="B4">B4</option>
            <option value="B5">B5</option>
          </select>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={!isPdf || isExporting}>
          <legend className={styles.legend}>方向</legend>
          <div className={styles.radioGroup}>
            <label className={styles.radio}>
              <input
                type="radio"
                name="orientation"
                value="landscape"
                checked={orientation === 'landscape'}
                onChange={() => setOrientation('landscape')}
              />
              横 (landscape)
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={orientation === 'portrait'}
                onChange={() => setOrientation('portrait')}
              />
              縦 (portrait)
            </label>
          </div>
        </fieldset>

        <p className={styles.hint}>
          {isPdf
            ? 'PDF は指定した用紙サイズ・方向で出力されます (アスペクト比保持)'
            : 'PNG は表示中のキャンバスをそのまま画像化します'}
        </p>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleExport} loading={isExporting}>
            ダウンロード
          </Button>
        </div>
      </div>
    </Modal>
  );
}
