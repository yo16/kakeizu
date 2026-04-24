/**
 * compressImage ユーティリティの単体テスト
 *
 * jsdom 環境では createImageBitmap / HTMLCanvasElement.toBlob が未実装のため、
 * 以下をモックして振る舞いを検証する:
 *   - global.createImageBitmap : ImageBitmap 相当のオブジェクトを返す
 *   - HTMLCanvasElement.prototype.getContext : { drawImage: jest.fn() } を返す
 *   - HTMLCanvasElement.prototype.toBlob     : Blob を同期的に渡すコールバック形式
 */

import { compressImage } from '../utils/compressImage';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * 指定サイズの ImageBitmap モックを返す createImageBitmap のスタブを作成する。
 */
function setupCreateImageBitmap(width: number, height: number) {
  const bitmap = { width, height, close: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).createImageBitmap = jest.fn().mockResolvedValue(bitmap);
  return bitmap;
}

/**
 * HTMLCanvasElement.prototype.getContext を { drawImage } を持つオブジェクトを返すよう override する。
 */
function setupGetContext() {
  const ctx = { drawImage: jest.fn() };
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockReturnValue(ctx as any);
  return ctx;
}

/**
 * HTMLCanvasElement.prototype.toBlob を override する。
 *
 * @param blob - コールバックに渡す Blob。null を渡すと null-return ケースをシミュレートする。
 */
function setupToBlob(blob: Blob | null) {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback, ...args) => {
      // コールバックは同期的に呼ぶ（Promise.resolve 内で非同期化される）
      callback(blob, ...args);
    });
}

/**
 * テスト用の File オブジェクトを生成する。
 */
function makeFile(name = 'test.png', type = 'image/png', size = 1024): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('compressImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // テスト #1: 長辺 3000px → 長辺 2048px にリサイズ
  // -------------------------------------------------------------------------
  describe('長辺 > 2048px の場合', () => {
    it('幅 3000px × 高さ 2000px の画像は長辺が 2048px になるようリサイズされること', async () => {
      // 3000 × 2000 → scale = 2048/3000
      // dstWidth = round(3000 * 2048/3000) = 2048
      // dstHeight = round(2000 * 2048/3000) = round(1365.33) = 1365
      setupCreateImageBitmap(3000, 2000);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const canvas = { width: 0, height: 0 };
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'canvas') {
          Object.defineProperties(el, {
            width:  { get: () => canvas.width,  set: (v) => { canvas.width = v; },  configurable: true },
            height: { get: () => canvas.height, set: (v) => { canvas.height = v; }, configurable: true },
          });
        }
        return el;
      });

      const result = await compressImage(makeFile());

      expect(canvas.width).toBe(2048);
      expect(canvas.height).toBe(1365);
      expect(result).toBe(outputBlob);
    });

    it('高さ 3000px × 幅 2000px の縦長画像は高さが 2048px になるようリサイズされること', async () => {
      // 2000 × 3000 → scale = 2048/3000
      // dstWidth  = round(2000 * 2048/3000) = round(1365.33) = 1365
      // dstHeight = round(3000 * 2048/3000) = 2048
      setupCreateImageBitmap(2000, 3000);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const canvas = { width: 0, height: 0 };
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'canvas') {
          Object.defineProperties(el, {
            width:  { get: () => canvas.width,  set: (v) => { canvas.width = v; },  configurable: true },
            height: { get: () => canvas.height, set: (v) => { canvas.height = v; }, configurable: true },
          });
        }
        return el;
      });

      const result = await compressImage(makeFile());

      expect(canvas.width).toBe(1365);
      expect(canvas.height).toBe(2048);
      expect(result).toBe(outputBlob);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #2: 長辺 1024px → リサイズなし（等倍）
  // -------------------------------------------------------------------------
  describe('長辺 <= 2048px の場合', () => {
    it('長辺 1024px の画像はリサイズされず元サイズを維持すること', async () => {
      setupCreateImageBitmap(1024, 768);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const canvas = { width: 0, height: 0 };
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'canvas') {
          Object.defineProperties(el, {
            width:  { get: () => canvas.width,  set: (v) => { canvas.width = v; },  configurable: true },
            height: { get: () => canvas.height, set: (v) => { canvas.height = v; }, configurable: true },
          });
        }
        return el;
      });

      await compressImage(makeFile());

      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(768);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #3: 長辺ちょうど 2048px（境界値）→ リサイズなし
  // -------------------------------------------------------------------------
  describe('境界値: 長辺 = 2048px', () => {
    it('長辺がちょうど 2048px の場合はリサイズされず等倍であること', async () => {
      setupCreateImageBitmap(2048, 1536);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const canvas = { width: 0, height: 0 };
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'canvas') {
          Object.defineProperties(el, {
            width:  { get: () => canvas.width,  set: (v) => { canvas.width = v; },  configurable: true },
            height: { get: () => canvas.height, set: (v) => { canvas.height = v; }, configurable: true },
          });
        }
        return el;
      });

      await compressImage(makeFile());

      expect(canvas.width).toBe(2048);
      expect(canvas.height).toBe(1536);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #4: PNG ファイル入力 → 出力は image/jpeg
  // -------------------------------------------------------------------------
  describe('出力 MIME タイプ', () => {
    it('PNG ファイルを渡した場合、toBlob が "image/jpeg" と quality 0.85 で呼ばれること', async () => {
      setupCreateImageBitmap(800, 600);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const result = await compressImage(makeFile('test.png', 'image/png'));

      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        'image/jpeg',
        0.85
      );
      expect(result.type).toBe('image/jpeg');
    });
  });

  // -------------------------------------------------------------------------
  // テスト #5: WebP ファイル入力 → 出力は image/jpeg
  // -------------------------------------------------------------------------
  describe('WebP ファイル入力', () => {
    it('WebP ファイルを渡した場合、toBlob が "image/jpeg" で呼ばれること', async () => {
      setupCreateImageBitmap(800, 600);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      await compressImage(makeFile('test.webp', 'image/webp'));

      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        'image/jpeg',
        0.85
      );
    });
  });

  // -------------------------------------------------------------------------
  // テスト #6: console.log が呼ばれること
  // -------------------------------------------------------------------------
  describe('ログ出力', () => {
    it('圧縮処理後に console.log が 1 回呼ばれること', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      setupCreateImageBitmap(800, 600);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      await compressImage(makeFile());

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('console.log の引数に圧縮前後のサイズ情報が含まれること', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      setupCreateImageBitmap(800, 600);
      setupGetContext();
      const outputBlob = new Blob(['dummy'], { type: 'image/jpeg' });
      setupToBlob(outputBlob);

      const file = makeFile();
      await compressImage(file);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[compressImage]')
      );
      const logArg: string = consoleSpy.mock.calls[0][0];
      expect(logArg).toContain(`${file.size} bytes`);
    });
  });

  // -------------------------------------------------------------------------
  // テスト #7: toBlob が null を返すケース → reject
  // -------------------------------------------------------------------------
  describe('異常系: toBlob が null を返す', () => {
    it('toBlob が null を渡した場合、Promise が reject されること', async () => {
      setupCreateImageBitmap(800, 600);
      setupGetContext();
      setupToBlob(null);

      await expect(compressImage(makeFile())).rejects.toThrow(
        'compressImage: toBlob が null を返しました'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 追加: getContext が null を返す場合 → throw
  // -------------------------------------------------------------------------
  describe('異常系: getContext が null を返す', () => {
    it('getContext が null を返した場合、エラーがスローされること', async () => {
      setupCreateImageBitmap(800, 600);
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValue(null as any);

      await expect(compressImage(makeFile())).rejects.toThrow(
        'compressImage: Canvas 2D コンテキストの取得に失敗しました'
      );
    });
  });
});
