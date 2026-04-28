/**
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';

describe('GitHub Actions Supabase Keepalive workflow (.github/workflows/supabase-keepalive.yml)', () => {
  let yamlContent: string;

  beforeAll(() => {
    const yamlPath = path.resolve(__dirname, '../../../.github/workflows/supabase-keepalive.yml');
    yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  });

  it('ワークフローファイルが存在し内容があること', () => {
    expect(yamlContent).toBeTruthy();
    expect(yamlContent.length).toBeGreaterThan(0);
  });

  it('name: Supabase Keepalive が定義されていること', () => {
    expect(yamlContent).toMatch(/^name:\s*Supabase Keepalive/m);
  });

  it('on: セクションが存在すること', () => {
    expect(yamlContent).toMatch(/^on:/m);
  });

  it('schedule: トリガーが定義されていること', () => {
    expect(yamlContent).toContain('schedule:');
  });

  it('workflow_dispatch: トリガーが定義されていること', () => {
    expect(yamlContent).toContain('workflow_dispatch:');
  });

  it("cron: '0 0 * * *' が定義されていること", () => {
    expect(yamlContent).toMatch(/cron:\s*['"]0 0 \* \* \*['"]/);
  });

  it('runs-on: ubuntu-latest が設定されていること', () => {
    expect(yamlContent).toContain('runs-on: ubuntu-latest');
  });

  it('env に SUPABASE_URL: ${{ secrets.SUPABASE_URL }} が含まれていること', () => {
    expect(yamlContent).toMatch(/SUPABASE_URL:\s*\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}/);
  });

  it('env に SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }} が含まれていること', () => {
    expect(yamlContent).toMatch(
      /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/,
    );
  });

  it('npx tsx scripts/keepalive.ts を実行する step が含まれていること', () => {
    expect(yamlContent).toContain('npx tsx scripts/keepalive.ts');
  });
});
