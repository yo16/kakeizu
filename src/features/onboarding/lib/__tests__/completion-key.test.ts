/**
 * getCompletionKey ユーティリティのテスト
 *
 * テスト観点:
 * - 正しいキー形式を返すこと
 * - treeId が異なれば異なるキーになること
 * - 空文字・特殊文字などの境界値
 */

import { getCompletionKey } from '../completion-key';

describe('getCompletionKey', () => {
  describe('正常系', () => {
    it('treeId を含む onboarding_completed_{treeId} 形式のキーを返すこと', () => {
      const key = getCompletionKey('tree-abc-123');
      expect(key).toBe('onboarding_completed_tree-abc-123');
    });

    it('prefix は常に onboarding_completed_ であること', () => {
      const key = getCompletionKey('anything');
      expect(key.startsWith('onboarding_completed_')).toBe(true);
    });

    it('異なる treeId で異なるキーを返すこと', () => {
      const keyA = getCompletionKey('tree-a');
      const keyB = getCompletionKey('tree-b');
      expect(keyA).not.toBe(keyB);
    });

    it('UUID 形式の treeId でも正しくキーを返すこと', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const key = getCompletionKey(uuid);
      expect(key).toBe(`onboarding_completed_${uuid}`);
    });
  });

  describe('境界値', () => {
    it('空文字の treeId でも処理できること', () => {
      const key = getCompletionKey('');
      expect(key).toBe('onboarding_completed_');
    });

    it('特殊文字を含む treeId でもそのまま使用されること', () => {
      const special = 'tree/123?foo=bar';
      const key = getCompletionKey(special);
      expect(key).toBe(`onboarding_completed_${special}`);
    });

    it('数字のみの treeId でも正しく処理されること', () => {
      const key = getCompletionKey('12345');
      expect(key).toBe('onboarding_completed_12345');
    });
  });
});
