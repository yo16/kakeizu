/**
 * CSS Design Tokens の静的解析テスト
 *
 * DOM マウントは行わず、ファイル内容を fs.readFileSync で取得し
 * 正規表現で必須プロパティの定義・参照を検証する。
 *
 * 検証観点:
 * 1. tokens.css の存在と必須カスタムプロパティの定義
 * 2. layout.tsx での tokens.css の import 順序
 * 3. globals.css の body ブロックでのトークン参照
 *
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const TOKENS_CSS = path.join(ROOT, 'src/styles/tokens.css');
const LAYOUT_TSX = path.join(ROOT, 'src/app/layout.tsx');
const GLOBALS_CSS = path.join(ROOT, 'src/app/globals.css');

// -------------------------------------------------------------------------
// ヘルパー: :root {} ブロックのみを抽出する
// -------------------------------------------------------------------------
function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([^}]*)\}/s);
  return match ? match[1] : '';
}

// -------------------------------------------------------------------------
// ヘルパー: body {} ブロックのみを抽出する
// -------------------------------------------------------------------------
function extractBodyBlock(css: string): string {
  // body { ... } の最初のブロックを取得（html, body {...} との複合も除外）
  const match = css.match(/(?:^|\n)body\s*\{([^}]*)\}/s);
  return match ? match[1] : '';
}

// -------------------------------------------------------------------------
// 1. tokens.css の存在と必須プロパティ定義
// -------------------------------------------------------------------------
describe('src/styles/tokens.css', () => {
  let cssContent: string;
  let rootBlock: string;

  beforeAll(() => {
    cssContent = fs.readFileSync(TOKENS_CSS, 'utf8');
    rootBlock = extractRootBlock(cssContent);
  });

  it('ファイルが存在すること', () => {
    expect(fs.existsSync(TOKENS_CSS)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // カラー Brand
  // ---------------------------------------------------------------------------
  describe(':root — Color Brand', () => {
    it('--color-brand-500 が定義されていること', () => {
      expect(rootBlock).toMatch(/--color-brand-500\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // カラー Neutral
  // ---------------------------------------------------------------------------
  describe(':root — Color Neutral', () => {
    const neutralTokens = [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-border',
    ];

    it.each(neutralTokens)('%s が定義されていること', (token) => {
      expect(rootBlock).toMatch(new RegExp(`${token}\\s*:`));
    });
  });

  // ---------------------------------------------------------------------------
  // カラー Semantic
  // ---------------------------------------------------------------------------
  describe(':root — Color Semantic', () => {
    const semanticTokens = [
      '--color-success',
      '--color-warning',
      '--color-danger',
      '--color-info',
    ];

    it.each(semanticTokens)('%s が定義されていること', (token) => {
      expect(rootBlock).toMatch(new RegExp(`${token}\\s*:`));
    });
  });

  // ---------------------------------------------------------------------------
  // カラー Relation
  // ---------------------------------------------------------------------------
  describe(':root — Color Relation', () => {
    it('--color-relation-biological が定義されていること', () => {
      expect(rootBlock).toMatch(/--color-relation-biological\s*:/);
    });

    it('--color-relation-marriage-current が定義されていること', () => {
      expect(rootBlock).toMatch(/--color-relation-marriage-current\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // タイポグラフィ
  // ---------------------------------------------------------------------------
  describe(':root — Typography', () => {
    const typographyTokens = [
      '--font-sans',
      '--font-size-md',
      '--line-height-base',
      '--font-weight-regular',
    ];

    it.each(typographyTokens)('%s が定義されていること', (token) => {
      expect(rootBlock).toMatch(new RegExp(`${token}\\s*:`));
    });
  });

  // ---------------------------------------------------------------------------
  // スペーシング
  // ---------------------------------------------------------------------------
  describe(':root — Spacing', () => {
    it('--space-4 が定義されていること', () => {
      expect(rootBlock).toMatch(/--space-4\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // Border Radius
  // ---------------------------------------------------------------------------
  describe(':root — Border Radius', () => {
    it('--radius-md が定義されていること', () => {
      expect(rootBlock).toMatch(/--radius-md\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // Shadow
  // ---------------------------------------------------------------------------
  describe(':root — Shadow', () => {
    it('--shadow-md が定義されていること', () => {
      expect(rootBlock).toMatch(/--shadow-md\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // Z-index
  // ---------------------------------------------------------------------------
  describe(':root — Z-index', () => {
    it('--z-modal が定義されていること', () => {
      expect(rootBlock).toMatch(/--z-modal\s*:/);
    });

    it('--z-toast が定義されていること', () => {
      expect(rootBlock).toMatch(/--z-toast\s*:/);
    });
  });

  // ---------------------------------------------------------------------------
  // Dark mode 拡張ポイント
  // ---------------------------------------------------------------------------
  describe('[data-theme="dark"] ブロック', () => {
    it('[data-theme="dark"] ブロックが存在すること', () => {
      expect(cssContent).toMatch(/\[data-theme\s*=\s*["']dark["']\]\s*\{/);
    });
  });
});

// -------------------------------------------------------------------------
// 2. layout.tsx での import 順序
// -------------------------------------------------------------------------
describe('src/app/layout.tsx', () => {
  let layoutContent: string;

  beforeAll(() => {
    layoutContent = fs.readFileSync(LAYOUT_TSX, 'utf8');
  });

  it('tokens.css が import されていること', () => {
    expect(layoutContent).toMatch(/import\s+['"][^'"]*tokens\.css['"]/);
  });

  it('globals.css が import されていること', () => {
    expect(layoutContent).toMatch(/import\s+['"][^'"]*globals\.css['"]/);
  });

  it('tokens.css が globals.css より前に import されていること', () => {
    const tokensIndex = layoutContent.search(/import\s+['"][^'"]*tokens\.css['"]/);
    const globalsIndex = layoutContent.search(/import\s+['"][^'"]*globals\.css['"]/);
    expect(tokensIndex).toBeGreaterThanOrEqual(0);
    expect(globalsIndex).toBeGreaterThanOrEqual(0);
    expect(tokensIndex).toBeLessThan(globalsIndex);
  });
});

// -------------------------------------------------------------------------
// 3. globals.css の body トークン参照
// -------------------------------------------------------------------------
describe('src/app/globals.css', () => {
  let globalsContent: string;
  let bodyBlock: string;

  beforeAll(() => {
    globalsContent = fs.readFileSync(GLOBALS_CSS, 'utf8');
    bodyBlock = extractBodyBlock(globalsContent);
  });

  describe('body ブロックのトークン参照', () => {
    const bodyTokenRefs = [
      'var(--color-text)',
      'var(--color-bg)',
      'var(--font-sans)',
      'var(--line-height-base)',
    ];

    it.each(bodyTokenRefs)('body が %s を参照していること', (tokenRef) => {
      expect(bodyBlock).toContain(tokenRef);
    });
  });

  describe('Next.js デフォルトトークンの除去', () => {
    it(':root に --background が残っていないこと', () => {
      const rootBlock = extractRootBlock(globalsContent);
      expect(rootBlock).not.toMatch(/--background\s*:/);
    });

    it(':root に --foreground が残っていないこと', () => {
      const rootBlock = extractRootBlock(globalsContent);
      expect(rootBlock).not.toMatch(/--foreground\s*:/);
    });
  });
});
