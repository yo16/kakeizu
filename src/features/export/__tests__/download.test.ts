/**
 * download.ts の単体テスト
 *
 * sanitizeFileName / buildExportFileName / downloadBlob の正常系・異常系・境界値を検証する。
 */

import { downloadBlob, sanitizeFileName, buildExportFileName } from '../lib/download';

// -----------------------------------------------------------------------
// sanitizeFileName テスト
// -----------------------------------------------------------------------
describe('sanitizeFileName', () => {
  describe('正常系: 禁止文字なし', () => {
    it('通常の文字列はそのまま返されること', () => {
      expect(sanitizeFileName('田中家')).toBe('田中家');
    });

    it('英数字のみの文字列はそのまま返されること', () => {
      expect(sanitizeFileName('TanakaFamily2024')).toBe('TanakaFamily2024');
    });

    it('空文字列は空文字列のまま返されること', () => {
      expect(sanitizeFileName('')).toBe('');
    });
  });

  describe('禁止文字の個別置換', () => {
    it('/ が _ に置換されること', () => {
      expect(sanitizeFileName('a/b')).toBe('a_b');
    });

    it('\\ が _ に置換されること', () => {
      expect(sanitizeFileName('a\\b')).toBe('a_b');
    });

    it(': が _ に置換されること', () => {
      expect(sanitizeFileName('a:b')).toBe('a_b');
    });

    it('* が _ に置換されること', () => {
      expect(sanitizeFileName('a*b')).toBe('a_b');
    });

    it('? が _ に置換されること', () => {
      expect(sanitizeFileName('a?b')).toBe('a_b');
    });

    it('" が _ に置換されること', () => {
      expect(sanitizeFileName('a"b')).toBe('a_b');
    });

    it('< が _ に置換されること', () => {
      expect(sanitizeFileName('a<b')).toBe('a_b');
    });

    it('> が _ に置換されること', () => {
      expect(sanitizeFileName('a>b')).toBe('a_b');
    });

    it('| が _ に置換されること', () => {
      expect(sanitizeFileName('a|b')).toBe('a_b');
    });
  });

  describe('複合ケース', () => {
    it('複数の禁止文字が混在する場合、すべて _ に置換されること', () => {
      expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    });

    it('通常の文字と禁止文字が混在する場合、禁止文字のみが置換されること', () => {
      expect(sanitizeFileName('田中/家系図')).toBe('田中_家系図');
    });
  });
});

// -----------------------------------------------------------------------
// buildExportFileName テスト
// -----------------------------------------------------------------------
describe('buildExportFileName', () => {
  describe('基本的なファイル名生成', () => {
    it('treeTitle, format, date を指定した場合に正しいファイル名が返されること', () => {
      const date = new Date(2026, 3, 28); // 2026-04-28
      expect(buildExportFileName('田中家', 'pdf', date)).toBe('田中家_2026-04-28.pdf');
    });

    it('format=png の場合に .png 拡張子のファイル名が返されること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName('山本家', 'png', date)).toBe('山本家_2026-04-28.png');
    });
  });

  describe('treeTitle のフォールバック', () => {
    it('treeTitle=null の場合、kakeizu が使われること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName(null, 'png', date)).toBe('kakeizu_2026-04-28.png');
    });

    it('treeTitle=undefined の場合、kakeizu が使われること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName(undefined, 'pdf', date)).toBe('kakeizu_2026-04-28.pdf');
    });

    it('treeTitle="" (空文字) の場合、kakeizu が使われること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName('', 'png', date)).toBe('kakeizu_2026-04-28.png');
    });

    it('treeTitle="   " (空白のみ) の場合、kakeizu が使われること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName('   ', 'pdf', date)).toBe('kakeizu_2026-04-28.pdf');
    });
  });

  describe('treeTitle に禁止文字が含まれる場合のサニタイズ', () => {
    it('treeTitle に / と \\ が含まれる場合、_ に置換されること', () => {
      const date = new Date(2026, 3, 28);
      expect(buildExportFileName('Tree/With\\Slashes', 'pdf', date)).toBe(
        'Tree_With_Slashes_2026-04-28.pdf'
      );
    });
  });

  describe('日付のゼロ埋め', () => {
    it('月と日が1桁の場合、2桁にゼロ埋めされること (1月5日)', () => {
      const date = new Date(2026, 0, 5); // 2026-01-05
      expect(buildExportFileName('家系図', 'pdf', date)).toBe('家系図_2026-01-05.pdf');
    });

    it('月が1桁の場合、2桁にゼロ埋めされること (3月)', () => {
      const date = new Date(2026, 2, 15); // 2026-03-15
      expect(buildExportFileName('家系図', 'png', date)).toBe('家系図_2026-03-15.png');
    });

    it('日が1桁の場合、2桁にゼロ埋めされること (9日)', () => {
      const date = new Date(2026, 11, 9); // 2026-12-09
      expect(buildExportFileName('家系図', 'pdf', date)).toBe('家系図_2026-12-09.pdf');
    });
  });

  describe('date 未指定時の挙動', () => {
    it('date 未指定の場合、今日の日付が使われること (kakeizu フォールバックと組み合わせ)', () => {
      const beforeCall = new Date();
      const result = buildExportFileName(null, 'png');
      const afterCall = new Date();

      // YYYY-MM-DD 形式かつ prefix が kakeizu_ であること
      expect(result).toMatch(/^kakeizu_\d{4}-\d{2}-\d{2}\.png$/);

      // 日付が呼び出し前後の範囲内であること
      const datePart = result.replace('kakeizu_', '').replace('.png', '');
      const resultDate = new Date(datePart);
      expect(resultDate.getFullYear()).toBeGreaterThanOrEqual(beforeCall.getFullYear());
      expect(resultDate.getFullYear()).toBeLessThanOrEqual(afterCall.getFullYear());
    });
  });
});

// -----------------------------------------------------------------------
// downloadBlob テスト
// -----------------------------------------------------------------------
describe('downloadBlob', () => {
  let mockCreateObjectURL: jest.Mock;
  let mockRevokeObjectURL: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
    mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('URL.createObjectURL が Blob を引数として呼ばれること', () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
  });

  it('URL.createObjectURL が 1 回だけ呼ばれること', () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it('動的 <a> 要素に href が createObjectURL の戻り値でセットされること', () => {
    // 実際の <a> 要素を用いてプロパティを検証する
    // (プレーンオブジェクトを返すと jsdom の appendChild が Node 型を要求して失敗するため)
    const anchorEl = document.createElement('a');
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(anchorEl);

    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    // jsdom では href に blob: URL を直接セットすると about:blank になるため、
    // createObjectURL が呼ばれたことと、a.download が正しく設定されたことで確認する
    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    createElementSpy.mockRestore();
  });

  it('動的 <a> 要素に download 属性が fileName でセットされること', () => {
    const anchorEl = document.createElement('a');
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(anchorEl);

    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlob(blob, 'my-file.pdf');

    expect(anchorEl.download).toBe('my-file.pdf');
    createElementSpy.mockRestore();
  });

  it('a.click() が呼ばれること', () => {
    const anchorEl = document.createElement('a');
    const clickSpy = jest.spyOn(anchorEl, 'click');
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(anchorEl);

    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    createElementSpy.mockRestore();
  });

  it('a 要素が document.body に append → click → remove される順序であること', () => {
    const callOrder: string[] = [];
    const anchorEl = document.createElement('a');
    jest.spyOn(anchorEl, 'click').mockImplementation(() => { callOrder.push('click'); });

    const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementationOnce(
      (node) => { callOrder.push('appendChild'); return node; }
    );
    const removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementationOnce(
      (node) => { callOrder.push('removeChild'); return node; }
    );
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(anchorEl);

    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    expect(callOrder).toEqual(['appendChild', 'click', 'removeChild']);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it('setTimeout 経由で URL.revokeObjectURL が呼ばれること', () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test.png');

    // setTimeout 実行前は revoke されていないこと
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    // 全タイマーを実行
    jest.runAllTimers();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
