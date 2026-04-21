/**
 * src/components/layout/index.ts barrel export のテスト
 *
 * テスト観点:
 * - MainShell, AuthShell, AppHeader が named export されていること
 *
 * @jest-environment node
 */

import * as path from 'path';
import * as fs from 'fs';

const BARREL = path.resolve(__dirname, '../../../src/components/layout/index.ts');

describe('src/components/layout/index.ts — barrel export', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(BARREL, 'utf8');
  });

  it('ファイルが存在すること', () => {
    expect(fs.existsSync(BARREL)).toBe(true);
  });

  it('MainShell が export されていること', () => {
    expect(content).toMatch(/export\s*\{[^}]*MainShell[^}]*\}/);
  });

  it('AuthShell が export されていること', () => {
    expect(content).toMatch(/export\s*\{[^}]*AuthShell[^}]*\}/);
  });

  it('AppHeader が export されていること', () => {
    expect(content).toMatch(/export\s*\{[^}]*AppHeader[^}]*\}/);
  });
});
