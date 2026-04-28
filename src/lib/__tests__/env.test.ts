import * as fs from 'fs';
import * as path from 'path';
import { serverEnvSchema, clientEnvSchema } from '../env';

describe('serverEnvSchema', () => {
  it('正常系: 必須フィールドのみで parse が成功する', () => {
    const result = serverEnvSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('正常系: すべてのフィールドが正しい値の場合 parse が成功する', () => {
    const result = serverEnvSchema.safeParse({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.LOG_LEVEL).toBe('warn');
    }
  });

  it('デフォルト値: NODE_ENV 未設定時に development になる', () => {
    const result = serverEnvSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('デフォルト値: LOG_LEVEL 未設定時に info になる', () => {
    const result = serverEnvSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LOG_LEVEL).toBe('info');
    }
  });

  it('異常系: LOG_LEVEL に不正な値が入った場合にエラーになる', () => {
    const result = serverEnvSchema.safeParse({
      LOG_LEVEL: 'verbose',
    });
    expect(result.success).toBe(false);
  });

  it('異常系: NODE_ENV に不正な値が入った場合にエラーになる', () => {
    const result = serverEnvSchema.safeParse({
      NODE_ENV: 'staging',
    });
    expect(result.success).toBe(false);
  });
});

describe('clientEnvSchema', () => {
  it('正常系: すべての値が空の場合 parse が成功する（全フィールドが optional）', () => {
    const result = clientEnvSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('正常系: 有効な URL が指定された場合 parse が成功する', () => {
    const result = clientEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('異常系: NEXT_PUBLIC_SUPABASE_URL に URL でない値が入った場合にエラーになる', () => {
    const result = clientEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('異常系: NEXT_PUBLIC_SITE_URL に URL でない値が入った場合にエラーになる', () => {
    const result = clientEnvSchema.safeParse({
      NEXT_PUBLIC_SITE_URL: 'invalid-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('server-only 宣言', () => {
  let envFileContent: string;

  beforeAll(() => {
    const envFilePath = path.resolve(__dirname, '../env.ts');
    envFileContent = fs.readFileSync(envFilePath, 'utf-8');
  });

  it("ファイルに `import 'server-only';` が含まれていること", () => {
    expect(envFileContent).toContain("import 'server-only';");
  });

  it("`import 'server-only';` が `import { z } from 'zod';` より前に現れること", () => {
    const serverOnlyIndex = envFileContent.indexOf("import 'server-only';");
    const zodIndex = envFileContent.indexOf("import { z } from 'zod';");
    expect(serverOnlyIndex).toBeGreaterThanOrEqual(0);
    expect(zodIndex).toBeGreaterThanOrEqual(0);
    expect(serverOnlyIndex).toBeLessThan(zodIndex);
  });

  it('clientEnvSchema のすべてのキーが NEXT_PUBLIC_ プレフィックスを持つこと（シークレット混入なし）', () => {
    const shape = clientEnvSchema.shape;
    const keys = Object.keys(shape);
    expect(keys.length).toBeGreaterThan(0);
    keys.forEach((key) => {
      expect(key).toMatch(/^NEXT_PUBLIC_/);
    });
  });
});
