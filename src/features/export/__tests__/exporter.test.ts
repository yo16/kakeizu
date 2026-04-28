/**
 * exporter.ts の単体テスト
 *
 * html-to-image / jsPDF をモックして exportTreeAsPng / exportTreeAsPdf の
 * 正常系・異常系・引数伝播・アスペクト比計算を検証する。
 */

// -----------------------------------------------------------------------
// html-to-image モック
// jest.mock はホイスティングされるため、factory 内で直接 jest.fn() を返す
// -----------------------------------------------------------------------
jest.mock('html-to-image', () => ({
  toBlob: jest.fn(),
}));

// -----------------------------------------------------------------------
// jsPDF モック
// -----------------------------------------------------------------------
jest.mock('jspdf', () => ({
  jsPDF: jest.fn(),
}));

// -----------------------------------------------------------------------
// import (モック宣言の後に配置)
// -----------------------------------------------------------------------
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { exportTreeAsPng, exportTreeAsPdf } from '../lib/exporter';

// -----------------------------------------------------------------------
// 型付きモック参照
// -----------------------------------------------------------------------
const mockToBlob = htmlToImage.toBlob as jest.MockedFunction<typeof htmlToImage.toBlob>;
const MockJsPDF = jsPDF as jest.MockedClass<typeof jsPDF>;

// -----------------------------------------------------------------------
// jsPDF インスタンスモック
// -----------------------------------------------------------------------
const mockAddImage = jest.fn();
const mockOutput = jest.fn();
const mockGetWidth = jest.fn();
const mockGetHeight = jest.fn();

// -----------------------------------------------------------------------
// FileReader モック
// jsdom の FileReader.readAsDataURL は実 Blob では動作しないため、
// onload を即座に発火するモック実装に差し替える
// -----------------------------------------------------------------------
class MockFileReader {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  result: string | null = 'data:image/png;base64,mockdata';

  readAsDataURL(_blob: Blob): void {
    setTimeout(() => {
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent<FileReader>);
      }
    }, 0);
  }
}

// -----------------------------------------------------------------------
// Image モック (naturalWidth / naturalHeight を制御可能)
// -----------------------------------------------------------------------
type MockImageOptions = { naturalWidth?: number; naturalHeight?: number };

function createMockImageClass(widthOrOptions: number | MockImageOptions = {}, height?: number) {
  let naturalWidth: number;
  let naturalHeight: number;
  if (typeof widthOrOptions === 'number') {
    naturalWidth = widthOrOptions;
    naturalHeight = height ?? 500;
  } else {
    naturalWidth = widthOrOptions.naturalWidth ?? 1000;
    naturalHeight = widthOrOptions.naturalHeight ?? 500;
  }
  return class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;

    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  };
}

// -----------------------------------------------------------------------
// テストヘルパー
// -----------------------------------------------------------------------
function createPngBlob(): Blob {
  return new Blob(['png-data'], { type: 'image/png' });
}

function createPdfBlob(): Blob {
  return new Blob(['%PDF-1.4'], { type: 'application/pdf' });
}

function createTargetElement(): HTMLElement {
  return document.createElement('div');
}

// -----------------------------------------------------------------------
// exportTreeAsPng テスト
// -----------------------------------------------------------------------
describe('exportTreeAsPng', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    it('toBlob が Blob を返す場合、同じ Blob を返すこと', async () => {
      const pngBlob = createPngBlob();
      mockToBlob.mockResolvedValue(pngBlob);

      const result = await exportTreeAsPng(createTargetElement());

      expect(result).toBe(pngBlob);
    });

    it('toBlob が 1 回だけ呼ばれること', async () => {
      mockToBlob.mockResolvedValue(createPngBlob());

      await exportTreeAsPng(createTargetElement());

      expect(mockToBlob).toHaveBeenCalledTimes(1);
    });
  });

  describe('デフォルト引数', () => {
    it('scale / backgroundColor を省略した場合にデフォルト値が適用されること', async () => {
      mockToBlob.mockResolvedValue(createPngBlob());
      const element = createTargetElement();

      await exportTreeAsPng(element);

      expect(mockToBlob).toHaveBeenCalledWith(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    });

    it('cacheBust: true が常に渡されること', async () => {
      mockToBlob.mockResolvedValue(createPngBlob());
      const targetElement = createTargetElement();

      await exportTreeAsPng(targetElement, { scale: 3, backgroundColor: '#000000' });

      expect(mockToBlob).toHaveBeenCalledWith(targetElement, {
        pixelRatio: 3,
        backgroundColor: '#000000',
        cacheBust: true,
      });
    });
  });

  describe('オプション引数の反映', () => {
    it('scale: 3 を渡すと pixelRatio: 3 で呼ばれること', async () => {
      mockToBlob.mockResolvedValue(createPngBlob());
      const targetElement = createTargetElement();

      await exportTreeAsPng(targetElement, { scale: 3 });

      expect(mockToBlob).toHaveBeenCalledWith(targetElement, {
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    });

    it('backgroundColor: "#000000" を渡すと反映されること', async () => {
      mockToBlob.mockResolvedValue(createPngBlob());
      const targetElement = createTargetElement();

      await exportTreeAsPng(targetElement, { backgroundColor: '#000000' });

      expect(mockToBlob).toHaveBeenCalledWith(targetElement, {
        pixelRatio: 2,
        backgroundColor: '#000000',
        cacheBust: true,
      });
    });
  });

  describe('異常系', () => {
    it('toBlob が null を返す場合に Error が throw されること', async () => {
      mockToBlob.mockResolvedValue(null);

      await expect(exportTreeAsPng(createTargetElement())).rejects.toThrow(
        'PNG の生成に失敗しました'
      );
    });

    it('toBlob が reject する場合にエラーが伝播すること', async () => {
      mockToBlob.mockRejectedValue(new Error('capture error'));

      await expect(exportTreeAsPng(createTargetElement())).rejects.toThrow('capture error');
    });
  });
});

// -----------------------------------------------------------------------
// exportTreeAsPdf テスト
// -----------------------------------------------------------------------
describe('exportTreeAsPdf', () => {
  // A4 landscape のページサイズ (mm)
  const PAGE_WIDTH_MM = 297;
  const PAGE_HEIGHT_MM = 210;

  beforeEach(() => {
    jest.clearAllMocks();

    // グローバル DOM モックの設定
    global.FileReader = MockFileReader as unknown as typeof FileReader;
    global.Image = createMockImageClass({ naturalWidth: 1000, naturalHeight: 500 }) as unknown as typeof Image;

    // jsPDF コンストラクタが内部モックインスタンスを返すよう設定
    MockJsPDF.mockImplementation(() => ({
      internal: {
        pageSize: {
          getWidth: mockGetWidth,
          getHeight: mockGetHeight,
        },
      },
      addImage: mockAddImage,
      output: mockOutput,
      // jsPDF 型の最低限の互換性を保つためのダミー
    } as unknown as jsPDF));

    // jsPDF ページサイズのデフォルト設定 (A4 landscape)
    mockGetWidth.mockReturnValue(PAGE_WIDTH_MM);
    mockGetHeight.mockReturnValue(PAGE_HEIGHT_MM);

    // デフォルト PNG Blob
    mockToBlob.mockResolvedValue(createPngBlob());

    // PDF output のデフォルト設定
    mockOutput.mockReturnValue(createPdfBlob());
  });

  describe('正常系', () => {
    it('PDF の Blob が返ること', async () => {
      const result = await exportTreeAsPdf(createTargetElement());

      expect(result).toBeInstanceOf(Blob);
    });

    it('output("blob") が呼ばれること', async () => {
      await exportTreeAsPdf(createTargetElement());

      expect(mockOutput).toHaveBeenCalledWith('blob');
    });
  });

  describe('jsPDF コンストラクタへの引数', () => {
    it('デフォルトで A4 landscape が渡されること', async () => {
      await exportTreeAsPdf(createTargetElement());

      expect(MockJsPDF).toHaveBeenCalledWith({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
    });

    it('paperSize: "A3" を渡すと format: "a3" になること', async () => {
      await exportTreeAsPdf(createTargetElement(), { paperSize: 'A3' });

      expect(MockJsPDF).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'a3' })
      );
    });

    it('paperSize: "B4" を渡すと format: "b4" になること', async () => {
      await exportTreeAsPdf(createTargetElement(), { paperSize: 'B4' });

      expect(MockJsPDF).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'b4' })
      );
    });

    it('paperSize: "B5" を渡すと format: "b5" になること', async () => {
      await exportTreeAsPdf(createTargetElement(), { paperSize: 'B5' });

      expect(MockJsPDF).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'b5' })
      );
    });

    it('orientation: "portrait" を渡すと jsPDF に portrait が渡されること', async () => {
      await exportTreeAsPdf(createTargetElement(), { orientation: 'portrait' });

      expect(MockJsPDF).toHaveBeenCalledWith(
        expect.objectContaining({ orientation: 'portrait' })
      );
    });

    it('unit は常に "mm" であること', async () => {
      await exportTreeAsPdf(createTargetElement(), { paperSize: 'A3', orientation: 'portrait' });

      expect(MockJsPDF).toHaveBeenCalledWith(
        expect.objectContaining({ unit: 'mm' })
      );
    });
  });

  describe('アスペクト比保持の中央配置計算', () => {
    it('横長画像 (1000x500) で幅がページ幅に合わせられること', async () => {
      // imgAspectRatio (2.0) > pageAspectRatio (297/210 ≈ 1.414) → 幅をページ幅に合わせる
      global.Image = createMockImageClass({ naturalWidth: 1000, naturalHeight: 500 }) as unknown as typeof Image;

      await exportTreeAsPdf(createTargetElement());

      // imgWidthMm = PAGE_WIDTH_MM = 297
      // imgHeightMm = PAGE_WIDTH_MM / (1000/500) = 297 / 2 = 148.5
      const expectedImgWidth = PAGE_WIDTH_MM;
      const expectedImgHeight = PAGE_WIDTH_MM / (1000 / 500);
      const expectedX = (PAGE_WIDTH_MM - expectedImgWidth) / 2; // = 0
      const expectedY = (PAGE_HEIGHT_MM - expectedImgHeight) / 2; // = (210 - 148.5) / 2

      expect(mockAddImage).toHaveBeenCalledWith(
        'data:image/png;base64,mockdata',
        'PNG',
        expectedX,
        expectedY,
        expectedImgWidth,
        expectedImgHeight
      );
    });

    it('縦長画像 (500x1000) で高さがページ高さに合わせられること', async () => {
      // imgAspectRatio (0.5) < pageAspectRatio (297/210 ≈ 1.414) → 高さをページ高さに合わせる
      global.Image = createMockImageClass({ naturalWidth: 500, naturalHeight: 1000 }) as unknown as typeof Image;

      await exportTreeAsPdf(createTargetElement());

      // imgHeightMm = PAGE_HEIGHT_MM = 210
      // imgWidthMm = PAGE_HEIGHT_MM * (500/1000) = 210 * 0.5 = 105
      const expectedImgHeight = PAGE_HEIGHT_MM;
      const expectedImgWidth = PAGE_HEIGHT_MM * (500 / 1000);
      const expectedX = (PAGE_WIDTH_MM - expectedImgWidth) / 2;
      const expectedY = (PAGE_HEIGHT_MM - expectedImgHeight) / 2; // = 0

      expect(mockAddImage).toHaveBeenCalledWith(
        'data:image/png;base64,mockdata',
        'PNG',
        expectedX,
        expectedY,
        expectedImgWidth,
        expectedImgHeight
      );
    });

    it('正方形画像 (500x500) で高さがページ高さに合わせられること', async () => {
      // imgAspectRatio (1.0) < pageAspectRatio (297/210 ≈ 1.414) → 高さをページ高さに合わせる
      global.Image = createMockImageClass({ naturalWidth: 500, naturalHeight: 500 }) as unknown as typeof Image;

      await exportTreeAsPdf(createTargetElement());

      const expectedImgHeight = PAGE_HEIGHT_MM;
      const expectedImgWidth = PAGE_HEIGHT_MM * 1.0; // = 210
      const expectedX = (PAGE_WIDTH_MM - expectedImgWidth) / 2;
      const expectedY = 0;

      expect(mockAddImage).toHaveBeenCalledWith(
        'data:image/png;base64,mockdata',
        'PNG',
        expectedX,
        expectedY,
        expectedImgWidth,
        expectedImgHeight
      );
    });
  });

  describe('exportTreeAsPng 失敗の伝播', () => {
    it('toBlob が null を返す場合に Error が throw されること', async () => {
      mockToBlob.mockResolvedValue(null);

      await expect(exportTreeAsPdf(createTargetElement())).rejects.toThrow(
        'PNG の生成に失敗しました'
      );
    });

    it('toBlob が reject する場合にエラーが伝播すること', async () => {
      mockToBlob.mockRejectedValue(new Error('capture error'));

      await expect(exportTreeAsPdf(createTargetElement())).rejects.toThrow('capture error');
    });
  });

  describe('PNG オプションの伝播', () => {
    it('scale オプションが exportTreeAsPng に渡されること', async () => {
      await exportTreeAsPdf(createTargetElement(), { scale: 3 });

      expect(mockToBlob).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ pixelRatio: 3 })
      );
    });

    it('backgroundColor オプションが exportTreeAsPng に渡されること', async () => {
      await exportTreeAsPdf(createTargetElement(), { backgroundColor: '#ff0000' });

      expect(mockToBlob).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ backgroundColor: '#ff0000' })
      );
    });
  });

  describe('FileReader エラーの伝播', () => {
    it('Blob の DataURL 変換失敗時に Error が throw されること', async () => {
      // MockFileReader を一時的に onerror を即発火する版に差し替え
      const ErrorFileReader = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        result: string | null = null;
        readAsDataURL(_blob: Blob): void {
          setTimeout(() => this.onerror?.(), 0);
        }
      };
      const original = global.FileReader;
      (global as any).FileReader = ErrorFileReader;
      try {
        mockToBlob.mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));
        const targetElement = document.createElement('div');
        await expect(exportTreeAsPdf(targetElement)).rejects.toThrow(
          'Blob から DataURL への変換に失敗しました'
        );
      } finally {
        (global as any).FileReader = original;
      }
    });
  });

  describe('Image 読み込みエラーの伝播', () => {
    it('画像サイズの取得失敗時に Error が throw されること', async () => {
      const ErrorImage = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 0;
        naturalHeight = 0;
        set src(_v: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      };
      const original = global.Image;
      (global as any).Image = ErrorImage;
      try {
        mockToBlob.mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));
        const targetElement = document.createElement('div');
        await expect(exportTreeAsPdf(targetElement)).rejects.toThrow(
          '画像サイズの取得に失敗しました'
        );
      } finally {
        (global as any).Image = original;
      }
    });
  });

  describe('portrait ページのアスペクト比保持', () => {
    beforeEach(() => {
      mockGetWidth.mockReturnValue(210);  // A4 portrait
      mockGetHeight.mockReturnValue(297);
    });

    it('portrait ページに横長画像 (1000x500) を配置 → 幅をページ幅に合わせ、高さ中央配置', async () => {
      const ImageClass = createMockImageClass(1000, 500);
      (global as any).Image = ImageClass;

      mockToBlob.mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));
      const targetElement = document.createElement('div');
      await exportTreeAsPdf(targetElement, { orientation: 'portrait' });

      // imgAspectRatio = 2.0 > pageAspectRatio = 0.707
      // imgWidthMm = 210, imgHeightMm = 210/2 = 105
      // xMm = 0, yMm = (297-105)/2 = 96
      expect(mockAddImage).toHaveBeenCalledWith(
        'data:image/png;base64,mockdata',
        'PNG',
        0,
        96,
        210,
        105
      );
    });

    it('portrait ページに縦長画像 (500x1000) を配置 → 高さをページ高さに合わせ、幅中央配置', async () => {
      const ImageClass = createMockImageClass(500, 1000);
      (global as any).Image = ImageClass;

      mockToBlob.mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));
      const targetElement = document.createElement('div');
      await exportTreeAsPdf(targetElement, { orientation: 'portrait' });

      // imgAspectRatio = 0.5 < pageAspectRatio = 0.707
      // imgHeightMm = 297, imgWidthMm = 297*0.5 = 148.5
      // xMm = (210-148.5)/2 = 30.75, yMm = 0
      expect(mockAddImage).toHaveBeenCalledWith(
        'data:image/png;base64,mockdata',
        'PNG',
        30.75,
        0,
        148.5,
        297
      );
    });
  });
});
