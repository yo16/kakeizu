/**
 * ExportModal コンポーネントのテスト
 *
 * フォーマット選択・ダウンロード処理・エラーハンドリング・loading 状態を検証する。
 */

// -----------------------------------------------------------------------
// モック宣言 (jest.mock はホイスティングされるため import より前に記述)
// -----------------------------------------------------------------------

// exporter モック
jest.mock('../lib/exporter', () => ({
  exportTreeAsPng: jest.fn(),
  exportTreeAsPdf: jest.fn(),
}));

// download モック
jest.mock('../lib/download', () => ({
  downloadBlob: jest.fn(),
  buildExportFileName: jest.fn((title: string | null | undefined, format: string) =>
    `${title ?? 'kakeizu'}.${format}`
  ),
}));

// useToast モック
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    success: mockSuccess,
    error: mockError,
    info: jest.fn(),
    warning: jest.fn(),
    show: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

// logger モック
jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  },
}));

// Modal モック (createPortal を回避)
jest.mock('@/components/ui/Modal/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
}));

// -----------------------------------------------------------------------
// import (モック宣言の後に配置)
// -----------------------------------------------------------------------
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { exportTreeAsPng, exportTreeAsPdf } from '../lib/exporter';
import { downloadBlob } from '../lib/download';
import { logger } from '@/lib/logger';
import { ExportModal } from '../components/ExportModal';

// -----------------------------------------------------------------------
// 型付きモック参照
// -----------------------------------------------------------------------
const mockExportTreeAsPng = exportTreeAsPng as jest.MockedFunction<typeof exportTreeAsPng>;
const mockExportTreeAsPdf = exportTreeAsPdf as jest.MockedFunction<typeof exportTreeAsPdf>;
const mockDownloadBlob = downloadBlob as jest.MockedFunction<typeof downloadBlob>;
const mockLoggerError = (logger as { error: jest.Mock }).error;

// -----------------------------------------------------------------------
// テストヘルパー
// -----------------------------------------------------------------------
function createTargetElement(): HTMLElement {
  return document.createElement('div');
}

interface RenderOptions {
  isOpen?: boolean;
  onClose?: jest.Mock;
  getTargetElement?: () => HTMLElement | SVGElement | null;
  treeTitle?: string | null;
}

function renderModal(options: RenderOptions = {}) {
  const {
    isOpen = true,
    onClose = jest.fn(),
    getTargetElement = () => createTargetElement(),
    treeTitle = '田中家',
  } = options;

  return render(
    <ExportModal
      isOpen={isOpen}
      onClose={onClose}
      getTargetElement={getTargetElement}
      treeTitle={treeTitle}
    />
  );
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------
describe('ExportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: PDF エクスポート成功
    mockExportTreeAsPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    mockExportTreeAsPng.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  });

  // ---------------------------------------------------------------------------
  // 表示制御
  // ---------------------------------------------------------------------------
  describe('表示制御', () => {
    it('isOpen=false の時は何も描画されないこと', () => {
      renderModal({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('isOpen=true の時はフォーマット選択 UI が表示されること', () => {
      renderModal({ isOpen: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('PDF')).toBeInTheDocument();
      expect(screen.getByLabelText('PNG')).toBeInTheDocument();
    });

    it('isOpen=true の時は用紙サイズ選択 UI が表示されること', () => {
      renderModal({ isOpen: true });
      expect(screen.getByLabelText('用紙サイズ')).toBeInTheDocument();
    });

    it('isOpen=true の時は方向選択 UI が表示されること', () => {
      renderModal({ isOpen: true });
      expect(screen.getByLabelText('横 (landscape)')).toBeInTheDocument();
      expect(screen.getByLabelText('縦 (portrait)')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // デフォルト値
  // ---------------------------------------------------------------------------
  describe('デフォルト値', () => {
    it('デフォルトで format=pdf が選択されていること', () => {
      renderModal();
      expect(screen.getByLabelText('PDF')).toBeChecked();
      expect(screen.getByLabelText('PNG')).not.toBeChecked();
    });

    it('デフォルトで paperSize=A4 が選択されていること', () => {
      renderModal();
      const select = screen.getByLabelText('用紙サイズ') as HTMLSelectElement;
      expect(select.value).toBe('A4');
    });

    it('デフォルトで orientation=landscape が選択されていること', () => {
      renderModal();
      expect(screen.getByLabelText('横 (landscape)')).toBeChecked();
      expect(screen.getByLabelText('縦 (portrait)')).not.toBeChecked();
    });
  });

  // ---------------------------------------------------------------------------
  // format 切り替え
  // ---------------------------------------------------------------------------
  describe('format 切り替え', () => {
    it('format=png に切り替えると paperSize fieldset が disabled になること', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByLabelText('PNG'));

      // 用紙サイズ fieldset を取得 (select の親 fieldset)
      const select = screen.getByLabelText('用紙サイズ');
      const paperSizeFieldset = select.closest('fieldset');
      expect(paperSizeFieldset).toBeDisabled();
    });

    it('format=png に切り替えると orientation fieldset が disabled になること', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByLabelText('PNG'));

      // 方向 fieldset を取得 (landscape radio の親 fieldset)
      const landscapeRadio = screen.getByLabelText('横 (landscape)');
      const orientationFieldset = landscapeRadio.closest('fieldset');
      expect(orientationFieldset).toBeDisabled();
    });

    it('format=pdf に戻すと paperSize fieldset が enabled になること', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByLabelText('PNG'));
      await user.click(screen.getByLabelText('PDF'));

      const select = screen.getByLabelText('用紙サイズ');
      const paperSizeFieldset = select.closest('fieldset');
      expect(paperSizeFieldset).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 選択状態の変更
  // ---------------------------------------------------------------------------
  describe('選択状態の変更', () => {
    it('paperSize=A3 を選択できること', async () => {
      const user = userEvent.setup();
      renderModal();

      const select = screen.getByLabelText('用紙サイズ') as HTMLSelectElement;
      await user.selectOptions(select, 'A3');

      expect(select.value).toBe('A3');
    });

    it('orientation=portrait を選択できること', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByLabelText('縦 (portrait)'));

      expect(screen.getByLabelText('縦 (portrait)')).toBeChecked();
      expect(screen.getByLabelText('横 (landscape)')).not.toBeChecked();
    });
  });

  // ---------------------------------------------------------------------------
  // ダウンロードボタンクリック (PDF)
  // ---------------------------------------------------------------------------
  describe('ダウンロードボタンクリック (PDF)', () => {
    it('exportTreeAsPdf が targetElement と { paperSize, orientation } で呼ばれること', async () => {
      const user = userEvent.setup();
      const targetEl = createTargetElement();
      const onClose = jest.fn();

      renderModal({ getTargetElement: () => targetEl, onClose });

      // A3 / portrait に変更
      const select = screen.getByLabelText('用紙サイズ') as HTMLSelectElement;
      await user.selectOptions(select, 'A3');
      await user.click(screen.getByLabelText('縦 (portrait)'));

      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockExportTreeAsPdf).toHaveBeenCalledWith(targetEl, {
          paperSize: 'A3',
          orientation: 'portrait',
        });
      });
    });

    it('exportTreeAsPng は呼ばれないこと (format=pdf)', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockExportTreeAsPdf).toHaveBeenCalled();
      });
      expect(mockExportTreeAsPng).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // ダウンロードボタンクリック (PNG)
  // ---------------------------------------------------------------------------
  describe('ダウンロードボタンクリック (PNG)', () => {
    it('exportTreeAsPng が targetElement で呼ばれること', async () => {
      const user = userEvent.setup();
      const targetEl = createTargetElement();
      const onClose = jest.fn();

      renderModal({ getTargetElement: () => targetEl, onClose });

      await user.click(screen.getByLabelText('PNG'));
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockExportTreeAsPng).toHaveBeenCalledWith(targetEl);
      });
    });

    it('exportTreeAsPdf は呼ばれないこと (format=png)', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByLabelText('PNG'));
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockExportTreeAsPng).toHaveBeenCalled();
      });
      expect(mockExportTreeAsPdf).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 成功時の動作
  // ---------------------------------------------------------------------------
  describe('成功時の動作', () => {
    it('downloadBlob が呼ばれること', async () => {
      const user = userEvent.setup();
      const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' });
      mockExportTreeAsPdf.mockResolvedValue(pdfBlob);

      renderModal();
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockDownloadBlob).toHaveBeenCalledWith(pdfBlob, expect.any(String));
      });
    });

    it('toast.success が呼ばれること', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockSuccess).toHaveBeenCalledWith('PDF を出力しました');
      });
    });

    it('onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      renderModal({ onClose });

      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getTargetElement が null を返す場合
  // ---------------------------------------------------------------------------
  describe('getTargetElement が null を返す場合', () => {
    it('toast.error("エクスポート対象が見つかりません") が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      renderModal({ getTargetElement: () => null, onClose });
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('エクスポート対象が見つかりません');
      });
    });

    it('export 関数が呼ばれないこと', async () => {
      const user = userEvent.setup();

      renderModal({ getTargetElement: () => null });
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalled();
      });
      expect(mockExportTreeAsPdf).not.toHaveBeenCalled();
      expect(mockExportTreeAsPng).not.toHaveBeenCalled();
    });

    it('onClose が呼ばれないこと', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      renderModal({ getTargetElement: () => null, onClose });
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalled();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // export 関数が throw した場合
  // ---------------------------------------------------------------------------
  describe('export 関数が throw した場合', () => {
    it('logger.error が呼ばれること', async () => {
      const user = userEvent.setup();
      const exportError = new Error('export failed');
      mockExportTreeAsPdf.mockRejectedValue(exportError);

      renderModal();
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          '[ExportModal] export failed:',
          exportError
        );
      });
    });

    it('toast.error("エクスポートに失敗しました") が呼ばれること', async () => {
      const user = userEvent.setup();
      mockExportTreeAsPdf.mockRejectedValue(new Error('export failed'));

      renderModal();
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('エクスポートに失敗しました');
      });
    });

    it('onClose が呼ばれないこと', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      mockExportTreeAsPdf.mockRejectedValue(new Error('export failed'));

      renderModal({ onClose });
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalled();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // ダウンロード中の disabled / loading 状態
  // ---------------------------------------------------------------------------
  describe('ダウンロード中の disabled / loading 状態', () => {
    it('isExporting=true の間は Cancel ボタンが disabled になること', async () => {
      // 解決しない Promise でエクスポート中状態を保持
      mockExportTreeAsPdf.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();

      renderModal();
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      });
    });

    it('isExporting=true の間はダウンロードボタンが loading 状態 (aria-disabled=true) になること', async () => {
      mockExportTreeAsPdf.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();

      renderModal();
      await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

      await waitFor(() => {
        const downloadButton = screen.getByRole('button', { name: 'ダウンロード' });
        expect(downloadButton).toHaveAttribute('aria-disabled', 'true');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // キャンセルボタン
  // ---------------------------------------------------------------------------
  describe('キャンセルボタン', () => {
    it('キャンセルボタンをクリックすると onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      renderModal({ onClose });
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
