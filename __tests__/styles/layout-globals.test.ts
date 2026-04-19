/**
 * レスポンシブ ブレイクポイント + グローバルレイアウト の静的解析テスト
 *
 * DOM マウントは行わず、ファイル内容を fs.readFileSync で取得し
 * 正規表現で必須プロパティ・構造を検証する。
 *
 * 検証観点:
 * 1. reset.css の必須リセット定義
 * 2. tokens.css 末尾のブレイクポイントコメント
 * 3. globals.css の a / :focus-visible / ::selection / prefers-reduced-motion
 * 4. layout.tsx のインポート順序・構造
 *
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT       = path.resolve(__dirname, '../../');
const RESET_CSS  = path.join(ROOT, 'src/styles/reset.css');
const TOKENS_CSS = path.join(ROOT, 'src/styles/tokens.css');
const GLOBALS_CSS= path.join(ROOT, 'src/app/globals.css');
const LAYOUT_TSX = path.join(ROOT, 'src/app/layout.tsx');

// -------------------------------------------------------------------------
// 1. reset.css
// -------------------------------------------------------------------------
describe('src/styles/reset.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(RESET_CSS, 'utf8');
  });

  it('ファイルが存在すること', () => {
    expect(fs.existsSync(RESET_CSS)).toBe(true);
  });

  it('box-sizing: border-box が定義されていること', () => {
    expect(css).toMatch(/box-sizing\s*:\s*border-box/);
  });

  it('margin: 0 が定義されていること', () => {
    expect(css).toMatch(/margin\s*:\s*0/);
  });

  it('padding: 0 が定義されていること', () => {
    expect(css).toMatch(/padding\s*:\s*0/);
  });

  it('a { color: inherit } が存在しないこと（前回NG対策）', () => {
    // a セレクタの中で color: inherit が設定されていないことを確認する
    // a セレクタブロック全体を抽出して検証
    const aBlocks = css.match(/\ba\s*\{[^}]*\}/gs) ?? [];
    for (const block of aBlocks) {
      expect(block).not.toMatch(/color\s*:\s*inherit/);
    }
  });
});

// -------------------------------------------------------------------------
// 2. tokens.css — ブレイクポイントコメント
// -------------------------------------------------------------------------
describe('src/styles/tokens.css — ブレイクポイントコメント', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(TOKENS_CSS, 'utf8');
  });

  it('sm ブレイクポイントコメントが末尾に存在すること', () => {
    expect(css).toMatch(/sm\s*:\s*@media\s*\(max-width\s*:\s*600px\)/);
  });

  it('md ブレイクポイントコメントが末尾に存在すること', () => {
    expect(css).toMatch(/md\s*:\s*@media\s*\(max-width\s*:\s*960px\)/);
  });

  it('lg ブレイクポイントコメントが末尾に存在すること', () => {
    expect(css).toMatch(/lg\s*:\s*@media\s*\(min-width\s*:\s*961px\)/);
  });
});

// -------------------------------------------------------------------------
// 3. globals.css
// -------------------------------------------------------------------------
describe('src/app/globals.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(GLOBALS_CSS, 'utf8');
  });

  describe('a セレクタのトークン参照', () => {
    it('a が --color-brand-500 を参照していること', () => {
      // a セレクタブロック（hover を除く）で color に --color-brand-500 を参照する
      expect(css).toMatch(/\ba\s*\{[^}]*var\(--color-brand-500\)[^}]*\}/s);
    });

    it('a:hover が --color-brand-700 を参照していること', () => {
      expect(css).toMatch(/a\s*:\s*hover\s*\{[^}]*var\(--color-brand-700\)[^}]*\}/s);
    });
  });

  describe(':focus-visible', () => {
    it(':focus-visible が定義されていること', () => {
      expect(css).toMatch(/:focus-visible\s*\{/);
    });
  });

  describe('::selection', () => {
    it('::selection が定義されていること', () => {
      expect(css).toMatch(/::selection\s*\{/);
    });
  });

  describe('prefers-reduced-motion', () => {
    it('@media (prefers-reduced-motion: reduce) が定義されていること', () => {
      expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
    });
  });
});

// -------------------------------------------------------------------------
// 4. layout.tsx — インポート順序・構造
// -------------------------------------------------------------------------
describe('src/app/layout.tsx', () => {
  let tsx: string;

  beforeAll(() => {
    tsx = fs.readFileSync(LAYOUT_TSX, 'utf8');
  });

  it('reset.css が import されていること', () => {
    expect(tsx).toMatch(/import\s+['"][^'"]*reset\.css['"]/);
  });

  it('tokens.css が import されていること', () => {
    expect(tsx).toMatch(/import\s+['"][^'"]*tokens\.css['"]/);
  });

  it('globals.css が import されていること', () => {
    expect(tsx).toMatch(/import\s+['"][^'"]*globals\.css['"]/);
  });

  it('reset.css → tokens.css → globals.css の順で import されていること', () => {
    const resetIdx   = tsx.search(/import\s+['"][^'"]*reset\.css['"]/);
    const tokensIdx  = tsx.search(/import\s+['"][^'"]*tokens\.css['"]/);
    const globalsIdx = tsx.search(/import\s+['"][^'"]*globals\.css['"]/);
    expect(resetIdx).toBeGreaterThanOrEqual(0);
    expect(tokensIdx).toBeGreaterThanOrEqual(0);
    expect(globalsIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeLessThan(tokensIdx);
    expect(tokensIdx).toBeLessThan(globalsIdx);
  });

  it('Geist / next/font/google の import が存在しないこと', () => {
    expect(tsx).not.toMatch(/next\/font\/google/);
  });

  it('<html lang="ja"> の記述があること', () => {
    expect(tsx).toMatch(/<html[^>]*lang\s*=\s*["']ja["']/);
  });
});
