/**
 * QuickAddRelativeModal コンポーネントのテスト
 *
 * テスト観点:
 * 1. 3 kind (parent/child/spouse) でのタイトル表示と PersonForm 描画
 * 2. 送信処理 (kind=parent): quickAddRelative 呼び出し内容の確認
 * 3. 送信処理 (kind=child, spouseId なし): spousePersonId を含めない
 * 4. 送信処理 (kind=child, spouseId あり): spousePersonId を含める
 * 5. 送信成功: router.refresh() 呼び出し・モーダルが閉じる (onClose)
 * 6. 送信失敗: エラーメッセージ表示・モーダルは閉じない
 * 7. 空文字 spouseId: spousePersonId として渡さない (クライアント側ガード)
 */

// ─── Server Action をモック ───────────────────────────────────────────────────
jest.mock('@/features/relation/actions/quick-add-relative', () => ({
  quickAddRelative: jest.fn(),
}));

// ─── next/navigation をモック ─────────────────────────────────────────────────
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

// ─── useToast をモック ────────────────────────────────────────────────────────
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    show: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAddRelativeModal } from '../QuickAddRelativeModal';
import { quickAddRelative } from '@/features/relation/actions/quick-add-relative';
import type { QuickAddRelativeModalProps } from '../QuickAddRelativeModal';

const mockQuickAddRelative = quickAddRelative as jest.MockedFunction<typeof quickAddRelative>;

// ─── テスト用 UUID ────────────────────────────────────────────────────────────
const ORIGIN_PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const SPOUSE_PERSON_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const NEW_PERSON_ID = 'cccccccc-0000-0000-0000-000000000001';
const NEW_RELATION_ID = 'dddddddd-0000-0000-0000-000000000001';

// ─── デフォルト props ──────────────────────────────────────────────────────────
function makeProps(overrides: Partial<QuickAddRelativeModalProps> = {}): QuickAddRelativeModalProps {
  return {
    open: true,
    onClose: jest.fn(),
    originPersonId: ORIGIN_PERSON_ID,
    kind: 'parent',
    ...overrides,
  };
}

// ─── PersonForm の名前フィールドに入力して送信するヘルパー ─────────────────────
async function fillAndSubmitForm(user: ReturnType<typeof userEvent.setup>, displayName = 'テスト 太郎') {
  const nameInput = screen.getByRole('textbox', { name: /表示名/ });
  await user.clear(nameInput);
  await user.type(nameInput, displayName);

  const submitBtn = screen.getByRole('button', { name: '追加' });
  await user.click(submitBtn);
}

describe('QuickAddRelativeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. 3 kind でのタイトル表示と PersonForm 描画
  // ─────────────────────────────────────────────────────────────────────────────
  describe('kind に応じたタイトル表示', () => {
    it('kind=parent のときタイトルが「親を追加」であること', () => {
      render(<QuickAddRelativeModal {...makeProps({ kind: 'parent' })} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('親を追加')).toBeInTheDocument();
    });

    it('kind=child のときタイトルが「子を追加」であること', () => {
      render(<QuickAddRelativeModal {...makeProps({ kind: 'child' })} />);
      expect(screen.getByText('子を追加')).toBeInTheDocument();
    });

    it('kind=spouse のときタイトルが「配偶者を追加」であること', () => {
      render(<QuickAddRelativeModal {...makeProps({ kind: 'spouse' })} />);
      expect(screen.getByText('配偶者を追加')).toBeInTheDocument();
    });

    it('PersonForm が描画されること (表示名フィールドが存在すること)', () => {
      render(<QuickAddRelativeModal {...makeProps()} />);
      // PersonForm 内の表示名フィールドを確認
      expect(screen.getByRole('textbox', { name: /表示名/ })).toBeInTheDocument();
    });

    it('open=false のときモーダルが非表示であること', () => {
      render(<QuickAddRelativeModal {...makeProps({ open: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. 送信処理 (kind=parent)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('送信処理 (kind=parent)', () => {
    it('quickAddRelative が originPersonId と kind="parent" で呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'parent' })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockQuickAddRelative).toHaveBeenCalledTimes(1);
        expect(mockQuickAddRelative).toHaveBeenCalledWith(
          expect.objectContaining({
            originPersonId: ORIGIN_PERSON_ID,
            kind: 'parent',
          })
        );
      });
    });

    it('kind=parent のとき spousePersonId が渡されないこと', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(
        <QuickAddRelativeModal
          {...makeProps({ kind: 'parent', selectedSpouseId: SPOUSE_PERSON_ID })}
        />
      );

      await fillAndSubmitForm(user);

      await waitFor(() => {
        const callArg = mockQuickAddRelative.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg).not.toHaveProperty('spousePersonId');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. 送信処理 (kind=child, spouseId なし)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('送信処理 (kind=child, spouseId なし)', () => {
    it('spousePersonId を含めずに呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(
        <QuickAddRelativeModal
          {...makeProps({ kind: 'child', selectedSpouseId: undefined })}
        />
      );

      await fillAndSubmitForm(user);

      await waitFor(() => {
        const callArg = mockQuickAddRelative.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg).not.toHaveProperty('spousePersonId');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. 送信処理 (kind=child, spouseId あり)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('送信処理 (kind=child, spouseId あり)', () => {
    it('spousePersonId を含めて呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(
        <QuickAddRelativeModal
          {...makeProps({ kind: 'child', selectedSpouseId: SPOUSE_PERSON_ID })}
        />
      );

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockQuickAddRelative).toHaveBeenCalledWith(
          expect.objectContaining({
            originPersonId: ORIGIN_PERSON_ID,
            kind: 'child',
            spousePersonId: SPOUSE_PERSON_ID,
          })
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. 送信成功: router.refresh() 呼び出し・onClose
  // ─────────────────────────────────────────────────────────────────────────────
  describe('送信成功', () => {
    it('router.refresh() が呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'child' })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledTimes(1);
      });
    });

    it('onClose が呼ばれること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const onClose = jest.fn();
      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'parent', onClose })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('成功トーストが表示されること (kind=parent → "親を追加しました")', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'parent' })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('親を追加しました');
      });
    });

    it('成功トーストが表示されること (kind=child → "子を追加しました")', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'child' })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('子を追加しました');
      });
    });

    it('成功トーストが表示されること (kind=spouse → "配偶者を追加しました")', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ kind: 'spouse' })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('配偶者を追加しました');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. 送信失敗: エラーメッセージ表示・モーダルは閉じない
  // ─────────────────────────────────────────────────────────────────────────────
  describe('送信失敗', () => {
    it('エラートーストが表示されること', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '内部エラーが発生しました' },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps()} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('内部エラーが発生しました');
      });
    });

    it('送信失敗時に onClose が呼ばれないこと (モーダルは閉じない)', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '内部エラーが発生しました' },
      });

      const onClose = jest.fn();
      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps({ onClose })} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledTimes(1);
      });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('送信失敗時に router.refresh() が呼ばれないこと', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'アクセス権がありません' },
      });

      const user = userEvent.setup();
      render(<QuickAddRelativeModal {...makeProps()} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledTimes(1);
      });
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. 空文字 spouseId: spousePersonId として渡さない (クライアント側ガード)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('空文字 spouseId のガード', () => {
    it('selectedSpouseId が空文字の場合 spousePersonId が渡されないこと', async () => {
      mockQuickAddRelative.mockResolvedValue({
        ok: true,
        data: { personId: NEW_PERSON_ID, relationId: NEW_RELATION_ID },
      });

      const user = userEvent.setup();
      render(
        <QuickAddRelativeModal
          {...makeProps({ kind: 'child', selectedSpouseId: '' })}
        />
      );

      await fillAndSubmitForm(user);

      await waitFor(() => {
        const callArg = mockQuickAddRelative.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg).not.toHaveProperty('spousePersonId');
      });
    });
  });
});
