/**
 * CreatePersonModal コンポーネントのテスト
 *
 * テスト観点:
 * - open=true でモーダルが render される
 * - open=false では render されない
 * - フォーム送信 → createPerson が呼ばれる
 * - createPerson 成功 → onSuccess + onClose 呼ばれる + トースト成功
 * - createPerson 失敗 (ok: false) → エラートースト表示 + onClose 呼ばれない
 * - 送信中は overlay click が無効（closeOnOverlayClick=false）
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePersonModal } from '@/features/person/components/CreatePersonModal';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/person/actions', () => ({
  createPerson: jest.fn(),
  getPerson: jest.fn(),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    show: jest.fn(),
    success: mockToastSuccess,
    error: mockToastError,
    warning: jest.fn(),
    info: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

import { createPerson, getPerson } from '@/features/person/actions';
const mockCreatePerson = createPerson as jest.MockedFunction<typeof createPerson>;
const mockGetPerson = getPerson as jest.MockedFunction<typeof getPerson>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const MOCK_PERSON = {
  id: 'person-001',
  treeId: 'tree-001',
  displayName: '田中 太郎',
  familyName: '田中',
  givenName: '太郎',
  maidenName: null,
  gender: 'male',
  birthYear: 1980,
  birthMonth: null,
  birthDay: null,
  birthPlace: null,
  deathYear: null,
  deathMonth: null,
  deathDay: null,
  deathPlace: null,
  isAlive: true,
  note: null,
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const DEFAULT_PROPS = {
  open: true,
  onClose: jest.fn(),
  treeId: 'tree-001',
  onSuccess: jest.fn(),
};

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

function getInput(id: string): HTMLInputElement {
  // eslint-disable-next-line testing-library/no-node-access
  return document.getElementById(id) as HTMLInputElement;
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('CreatePersonModal', () => {
  beforeEach(() => {
    mockCreatePerson.mockReset();
    mockGetPerson.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    DEFAULT_PROPS.onClose = jest.fn();
    DEFAULT_PROPS.onSuccess = jest.fn();
  });

  /* ================================================================ */
  /* 表示/非表示                                                        */
  /* ================================================================ */

  describe('表示/非表示', () => {
    it('open=true のときダイアログが表示される', () => {
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('open=false のときダイアログが表示されない', () => {
      render(<CreatePersonModal {...DEFAULT_PROPS} open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('タイトル「人物を追加」が表示される', () => {
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      expect(screen.getByText('人物を追加')).toBeInTheDocument();
    });

    it('「追加」ボタンが表示される', () => {
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* 送信成功                                                           */
  /* ================================================================ */

  describe('送信成功', () => {
    it('フォーム送信 → createPerson が呼ばれる', async () => {
      mockCreatePerson.mockResolvedValue({ ok: true, data: { personId: 'person-001' } });
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(mockCreatePerson).toHaveBeenCalled();
      });
    });

    it('createPerson 成功 → トースト成功が表示される', async () => {
      mockCreatePerson.mockResolvedValue({ ok: true, data: { personId: 'person-001' } });
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物を追加しました');
      });
    });

    it('createPerson 成功 → onClose が呼ばれる', async () => {
      mockCreatePerson.mockResolvedValue({ ok: true, data: { personId: 'person-001' } });
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
      });
    });

    it('createPerson 成功 + getPerson 成功 → onSuccess が person データで呼ばれる', async () => {
      mockCreatePerson.mockResolvedValue({ ok: true, data: { personId: 'person-001' } });
      mockGetPerson.mockResolvedValue({ ok: true, data: MOCK_PERSON });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(DEFAULT_PROPS.onSuccess).toHaveBeenCalledWith(MOCK_PERSON);
      });
    });
  });

  /* ================================================================ */
  /* 送信失敗                                                           */
  /* ================================================================ */

  describe('送信失敗', () => {
    it('createPerson 失敗 → エラートーストが表示される', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'サーバーエラーが発生しました' },
      });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('サーバーエラーが発生しました');
      });
    });

    it('createPerson 失敗 → onClose は呼ばれない', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'サーバーエラーが発生しました' },
      });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
    });

    it('createPerson 失敗 → onSuccess は呼ばれない', async () => {
      mockCreatePerson.mockResolvedValue({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'サーバーエラーが発生しました' },
      });
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* キャンセルボタン                                                   */
  /* ================================================================ */

  describe('キャンセルボタン', () => {
    it('キャンセルボタンをクリックすると onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* 送信中UI状態                                                       */
  /* ================================================================ */

  describe('送信中UI状態', () => {
    it('送信中は追加ボタンが disabled になる', async () => {
      let resolveCreate: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveCreate = resolve;
      });
      mockCreatePerson.mockReturnValueOnce(pendingPromise);

      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      // 送信開始（Promiseは解決しない）
      await user.click(screen.getByRole('button', { name: '追加' }));

      // 送信中は追加ボタンが disabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
      });

      // クリーンアップのためにPromiseを解決
      resolveCreate!({ ok: false, error: { code: 'TEST', message: 'test' } });
    });

    it('送信中はオーバーレイクリックで onClose が呼ばれない', async () => {
      let resolveCreate: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveCreate = resolve;
      });
      mockCreatePerson.mockReturnValueOnce(pendingPromise);

      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      // 送信開始（Promiseは解決しない）
      await user.click(screen.getByRole('button', { name: '追加' }));

      // 送信中は追加ボタンが disabled になることを確認（isSubmitting=true）
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
      });

      // オーバーレイ（role="dialog" の親要素）をクリック
      // Modal は closeOnOverlayClick=false のため onClose は呼ばれない
      const dialog = screen.getByRole('dialog');
      // eslint-disable-next-line testing-library/no-node-access
      const overlay = dialog.parentElement;
      if (overlay) {
        await user.click(overlay);
      }
      expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();

      // クリーンアップ
      resolveCreate!({ ok: false, error: { code: 'TEST', message: 'test' } });
    });
  });

  /* ================================================================ */
  /* createPerson 成功 + getPerson 失敗                                 */
  /* ================================================================ */

  describe('createPerson 成功 + getPerson 失敗', () => {
    it('createPerson 成功 + getPerson 失敗 → onSuccess は呼ばれない', async () => {
      mockCreatePerson.mockResolvedValue({ ok: true, data: { personId: 'person-001' } });
      mockGetPerson.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });

      const user = userEvent.setup();
      render(<CreatePersonModal {...DEFAULT_PROPS} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '追加' }));

      // onClose は呼ばれる（createPerson 成功後に onClose()）
      await waitFor(() => {
        expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
      });
      // onSuccess は getPerson 失敗のため呼ばれない
      expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled();
    });
  });
});
