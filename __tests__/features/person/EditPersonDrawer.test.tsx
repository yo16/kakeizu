/**
 * EditPersonDrawer コンポーネントのテスト
 *
 * テスト観点:
 * - open=true でドロワーが render される
 * - open=false では render されない
 * - defaultValues が props.person から反映される
 * - フォーム送信 → updatePerson が呼ばれる
 * - updatePerson 成功 → onClose + トースト成功
 * - updatePerson 失敗 → エラートースト + onClose 未呼び出し
 * - Escape キーで閉じる
 * - 送信中は閉じるボタンが disabled
 * - キャンセルボタンで onClose が呼ばれる
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditPersonDrawer } from '@/features/person/components/EditPersonDrawer';
import type { Person } from '@/features/person/actions';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/person/actions', () => ({
  updatePerson: jest.fn(),
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

import { updatePerson } from '@/features/person/actions';
const mockUpdatePerson = updatePerson as jest.MockedFunction<typeof updatePerson>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const MOCK_PERSON: Person = {
  id: 'person-001',
  treeId: 'tree-001',
  displayName: '田中 太郎',
  familyName: '田中',
  givenName: '太郎',
  maidenName: null,
  gender: 'male',
  birthYear: 1980,
  birthMonth: 5,
  birthDay: null,
  birthPlace: '東京都',
  deathYear: null,
  deathMonth: null,
  deathDay: null,
  deathPlace: null,
  isAlive: true,
  note: 'テストメモ',
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
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

describe('EditPersonDrawer', () => {
  let mockOnClose: jest.Mock;

  beforeEach(() => {
    mockOnClose = jest.fn();
    mockUpdatePerson.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  /* ================================================================ */
  /* 表示/非表示                                                        */
  /* ================================================================ */

  describe('表示/非表示', () => {
    it('open=true のときドロワーが表示される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('open=false のときドロワーが表示されない', () => {
      render(<EditPersonDrawer open={false} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('タイトル「人物を編集」が表示される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(screen.getByText('人物を編集')).toBeInTheDocument();
    });

    it('「更新」ボタンが表示される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* defaultValues（props.person からの反映）                           */
  /* ================================================================ */

  describe('defaultValues の反映', () => {
    it('displayName が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('displayName')).toHaveValue('田中 太郎');
    });

    it('familyName が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('familyName')).toHaveValue('田中');
    });

    it('givenName が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('givenName')).toHaveValue('太郎');
    });

    it('birthYear が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('birthYear')).toHaveValue(1980);
    });

    it('birthMonth が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('birthMonth')).toHaveValue(5);
    });

    it('birthPlace が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(getInput('birthPlace')).toHaveValue('東京都');
    });

    it('note が person から反映される', () => {
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      expect(document.getElementById('note')).toHaveValue('テストメモ');
    });

    it('isAlive=false の人物では死亡フィールドが表示される', () => {
      const deadPerson: Person = {
        ...MOCK_PERSON,
        isAlive: false,
        deathYear: 2020,
        deathMonth: 3,
        deathDay: null,
      };
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={deadPerson} />);
      expect(getInput('deathYear')).toBeInTheDocument();
      expect(getInput('deathYear')).toHaveValue(2020);
    });
  });

  /* ================================================================ */
  /* 送信成功                                                           */
  /* ================================================================ */

  describe('送信成功', () => {
    it('フォーム送信 → updatePerson が呼ばれる', async () => {
      mockUpdatePerson.mockResolvedValue({ ok: true, data: undefined as void });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockUpdatePerson).toHaveBeenCalled();
      });
    });

    it('updatePerson 成功 → トースト成功が表示される', async () => {
      mockUpdatePerson.mockResolvedValue({ ok: true, data: undefined as void });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物情報を更新しました');
      });
    });

    it('updatePerson 成功 → onClose が呼ばれる', async () => {
      mockUpdatePerson.mockResolvedValue({ ok: true, data: undefined as void });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('updatePerson に personId が渡される', async () => {
      mockUpdatePerson.mockResolvedValue({ ok: true, data: undefined as void });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockUpdatePerson).toHaveBeenCalledWith(
          expect.objectContaining({ personId: 'person-001' })
        );
      });
    });
  });

  /* ================================================================ */
  /* 送信失敗                                                           */
  /* ================================================================ */

  describe('送信失敗', () => {
    it('updatePerson 失敗 → エラートーストが表示される', async () => {
      mockUpdatePerson.mockResolvedValue({
        ok: false,
        error: { code: 'SERVER_ERROR', message: '更新に失敗しました' },
      });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('更新に失敗しました');
      });
    });

    it('updatePerson 失敗 → onClose は呼ばれない', async () => {
      mockUpdatePerson.mockResolvedValue({
        ok: false,
        error: { code: 'SERVER_ERROR', message: '更新に失敗しました' },
      });
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* Escape キーで閉じる                                                */
  /* ================================================================ */

  describe('Escape キーで閉じる', () => {
    it('open=true のとき Escape キーで onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.keyboard('{Escape}');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* 閉じるボタン                                                       */
  /* ================================================================ */

  describe('閉じるボタン', () => {
    it('閉じるボタンをクリックすると onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: '閉じる' }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* キャンセルボタン                                                   */
  /* ================================================================ */

  describe('キャンセルボタン', () => {
    it('キャンセルボタンをクリックすると onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* 送信中の閉じる操作無効化                                           */
  /* ================================================================ */

  describe('送信中の閉じる操作無効化', () => {
    it('送信中は閉じるボタンが disabled', async () => {
      let resolveUpdate: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveUpdate = resolve;
      });
      mockUpdatePerson.mockReturnValueOnce(pendingPromise);

      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      // 送信開始（Promiseは解決しない）
      await user.click(screen.getByRole('button', { name: '更新' }));

      // 送信中は閉じるボタンが disabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
      });

      // クリーンアップ
      resolveUpdate!({ ok: false, error: { code: 'TEST', message: 'test' } });
    });

    it('送信中は Escape キーで onClose が呼ばれない', async () => {
      let resolveUpdate: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveUpdate = resolve;
      });
      mockUpdatePerson.mockReturnValueOnce(pendingPromise);

      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      // 送信開始（Promiseは解決しない）
      await user.click(screen.getByRole('button', { name: '更新' }));

      // 送信中状態を待つ
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
      });

      // Escape キー送信 → isSubmitting=true のため onClose は呼ばれない
      await user.keyboard('{Escape}');
      expect(mockOnClose).not.toHaveBeenCalled();

      // クリーンアップ
      resolveUpdate!({ ok: false, error: { code: 'TEST', message: 'test' } });
    });
  });

  /* ================================================================ */
  /* オーバーレイクリック                                               */
  /* ================================================================ */

  describe('オーバーレイクリック', () => {
    it('オーバーレイクリックで onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      // role="dialog" の親要素（オーバーレイ div）を取得してクリック
      const dialog = screen.getByRole('dialog');
      // eslint-disable-next-line testing-library/no-node-access
      const overlay = dialog.parentElement;
      if (overlay) {
        await user.click(overlay);
      }
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('送信中はオーバーレイクリックで onClose が呼ばれない', async () => {
      let resolveUpdate: (value: any) => void;
      const pendingPromise = new Promise<any>((resolve) => {
        resolveUpdate = resolve;
      });
      mockUpdatePerson.mockReturnValueOnce(pendingPromise);

      const user = userEvent.setup();
      render(<EditPersonDrawer open={true} onClose={mockOnClose} person={MOCK_PERSON} />);
      // 送信開始（Promiseは解決しない）
      await user.click(screen.getByRole('button', { name: '更新' }));

      // 送信中状態を待つ
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
      });

      // オーバーレイクリック → isSubmitting=true のため onClose は呼ばれない
      const dialog = screen.getByRole('dialog');
      // eslint-disable-next-line testing-library/no-node-access
      const overlay = dialog.parentElement;
      if (overlay) {
        await user.click(overlay);
      }
      expect(mockOnClose).not.toHaveBeenCalled();

      // クリーンアップ
      resolveUpdate!({ ok: false, error: { code: 'TEST', message: 'test' } });
    });
  });
});
