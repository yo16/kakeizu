/**
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';

describe('GitHub Actions CI workflow (.github/workflows/ci.yml)', () => {
  let yamlContent: string;

  beforeAll(() => {
    const yamlPath = path.resolve(__dirname, '../../../.github/workflows/ci.yml');
    yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  });

  it('CI ワークフローファイルが存在し内容があること', () => {
    expect(yamlContent).toBeTruthy();
    expect(yamlContent.length).toBeGreaterThan(0);
  });

  it('name: CI が定義されていること', () => {
    expect(yamlContent).toMatch(/^name:\s*CI/m);
  });

  it('on: セクションが存在すること', () => {
    expect(yamlContent).toMatch(/^on:/m);
  });

  it('pull_request: トリガーが定義されていること', () => {
    expect(yamlContent).toContain('pull_request:');
  });

  it('branches-ignore: で release が除外されていること', () => {
    expect(yamlContent).toMatch(/branches-ignore:/);
    expect(yamlContent).toMatch(/- release/);
  });

  it('branches-ignore: で preview が除外されていること', () => {
    expect(yamlContent).toMatch(/- preview/);
  });

  it('jobs: セクションが存在すること', () => {
    expect(yamlContent).toMatch(/^jobs:/m);
  });

  it('runs-on: ubuntu-latest が設定されていること', () => {
    expect(yamlContent).toContain('runs-on: ubuntu-latest');
  });

  it("node-version が '20' または 20 に設定されていること", () => {
    expect(yamlContent).toMatch(/node-version:\s*['"]?20['"]?/);
  });

  it("cache: 'npm' または cache: npm が設定されていること", () => {
    expect(yamlContent).toMatch(/cache:\s*['"]?npm['"]?/);
  });

  it('必須ステップ (npm ci / lint / typecheck / test --ci) がすべて含まれていること', () => {
    expect(yamlContent).toContain('npm ci');
    expect(yamlContent).toContain('npm run lint');
    expect(yamlContent).toContain('npm run typecheck');
    expect(yamlContent).toContain('npm test -- --ci');
  });

  it('timeout-minutes が設定されていること', () => {
    expect(yamlContent).toMatch(/timeout-minutes:\s*\d+/);
  });
});
