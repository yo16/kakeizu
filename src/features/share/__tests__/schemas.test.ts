/**
 * Share ドメイン zod スキーマのユニットテスト
 *
 * createShareLinkSchema / revokeShareLinkSchema の境界値・正常値を検証する。
 */

import { createShareLinkSchema, revokeShareLinkSchema } from '../schemas';

// テスト用 UUID（正常値）
const VALID_UUID = 'bbbbbbbb-0000-0000-0000-000000000001';

describe('createShareLinkSchema', () => {
  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    it('有効な UUID を渡すと成功すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: VALID_UUID });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.treeId).toBe(VALID_UUID);
      }
    });

    it('ハイフン区切りの標準的な UUID 形式でも成功すること', () => {
      const result = createShareLinkSchema.safeParse({
        treeId: '00000000-0000-4000-8000-000000000000',
      });

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーション失敗
  // ---------------------------------------------------------------------------
  describe('バリデーション失敗', () => {
    it('treeId が UUID 形式でない場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: 'not-a-uuid' });

      expect(result.success).toBe(false);
    });

    it('treeId が空文字の場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: '' });

      expect(result.success).toBe(false);
    });

    it('treeId が undefined の場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: undefined });

      expect(result.success).toBe(false);
    });

    it('treeId が null の場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: null });

      expect(result.success).toBe(false);
    });

    it('入力が空オブジェクトの場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('treeId が数値の場合 失敗すること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: 12345 });

      expect(result.success).toBe(false);
    });

    it('treeId がハイフンなしの 32 文字 hex の場合 失敗すること', () => {
      // UUID 形式ではない (ハイフン区切りが必要)
      const result = createShareLinkSchema.safeParse({
        treeId: 'bbbbbbbb00000000000000000000001',
      });

      expect(result.success).toBe(false);
    });

    it('バリデーション失敗時のエラーメッセージが含まれること', () => {
      const result = createShareLinkSchema.safeParse({ treeId: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('有効なツリーIDを指定してください');
      }
    });
  });
});

describe('revokeShareLinkSchema', () => {
  // ---------------------------------------------------------------------------
  // 正常系
  // ---------------------------------------------------------------------------
  describe('正常系', () => {
    it('有効な UUID を渡すと成功すること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: VALID_UUID });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.linkId).toBe(VALID_UUID);
      }
    });

    it('ハイフン区切りの標準的な UUID 形式でも成功すること', () => {
      const result = revokeShareLinkSchema.safeParse({
        linkId: '00000000-0000-4000-8000-000000000000',
      });

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // バリデーション失敗
  // ---------------------------------------------------------------------------
  describe('バリデーション失敗', () => {
    it('linkId が UUID 形式でない場合 失敗すること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: 'not-a-uuid' });

      expect(result.success).toBe(false);
    });

    it('linkId が空文字の場合 失敗すること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: '' });

      expect(result.success).toBe(false);
    });

    it('linkId が undefined の場合 失敗すること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: undefined });

      expect(result.success).toBe(false);
    });

    it('linkId が null の場合 失敗すること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: null });

      expect(result.success).toBe(false);
    });

    it('入力が空オブジェクトの場合 失敗すること', () => {
      const result = revokeShareLinkSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('バリデーション失敗時のエラーメッセージが含まれること', () => {
      const result = revokeShareLinkSchema.safeParse({ linkId: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('有効なリンクIDを指定してください');
      }
    });
  });
});
