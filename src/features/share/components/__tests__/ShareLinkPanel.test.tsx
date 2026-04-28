/**
 * ShareLinkPanel コンポーネントのテスト
 *
 * 未発行状態・発行済み状態・クリップボードコピー・無効化フローを検証する。
 */

// Server Actions をモック (実装が個別ファイルから import しているため個別にモック)
jest.mock('@/features/share/actions/createShareLink', () => ({
  createShareLink: jest.fn(),
}));
jest.mock('@/features/share/actions/revokeShareLink', () => ({
  revokeShareLink: jest.fn(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createShareLink } from '@/features/share/actions/createShareLink';
import { revokeShareLink } from '@/features/share/actions/revokeShareLink';
import { ShareLinkPanel } from '../ShareLinkPanel';

const mockCreateShareLink = createShareLink as jest.MockedFunction<typeof createShareLink>;
const mockRevokeShareLink = revokeShareLink as jest.MockedFunction<typeof revokeShareLink>;

// クリップボード API のモック
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// document.execCommand のモック (jsdom には存在しないため Object.defineProperty で設定)
const execCommandMock = jest.fn().mockReturnValue(true);
Object.defineProperty(document, 'execCommand', {
  value: execCommandMock,
  configurable: true,
  writable: true,
});

// テスト用定数
const TREE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const LINK_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TOKEN = 'TESTTOKEN123_abcdefghij';

/** テスト用 ShareLink */
const TEST_LINK = {
  id: LINK_ID,
  treeId: TREE_ID,
  token: TOKEN,
  isEnabled: true,
  createdAt: '2026-04-27T00:00:00.000Z',
};

describe('ShareLinkPanel', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    execCommandMock.mockClear();
    execCommandMock.mockReturnValue(true);
    confirmSpy = jest.spyOn(window, 'confirm');
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // A. initialLink === null の場合 (発行 UI)
  // ---------------------------------------------------------------------------
  describe('initialLink === null の場合（発行 UI）', () => {
    it('「共有URLを発行する」ボタンが表示されること', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      expect(
        screen.getByRole('button', { name: '共有URLを発行する' })
      ).toBeInTheDocument();
    });

    it('「無効化する」ボタンが表示されないこと', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      expect(
        screen.queryByRole('button', { name: '無効化する' })
      ).not.toBeInTheDocument();
    });

    it('「共有URLを発行する」ボタン押下で createShareLink({ treeId }) が呼ばれること', async () => {
      mockCreateShareLink.mockResolvedValue({ ok: true, data: TEST_LINK });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLを発行する' }));

      await waitFor(() => {
        expect(mockCreateShareLink).toHaveBeenCalledWith({ treeId: TREE_ID });
      });
    });

    it('createShareLink 成功時に共有 URL 表示 UI に切り替わること（link state 更新）', async () => {
      mockCreateShareLink.mockResolvedValue({ ok: true, data: TEST_LINK });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLを発行する' }));

      await waitFor(() => {
        // URL 表示 input が現れること
        expect(screen.getByRole('textbox', { name: '共有URL' })).toBeInTheDocument();
      });

      // 発行ボタンが消えること
      expect(
        screen.queryByRole('button', { name: '共有URLを発行する' })
      ).not.toBeInTheDocument();
    });

    it('createShareLink 成功後に生成されたトークンが URL 表示に含まれること', async () => {
      mockCreateShareLink.mockResolvedValue({ ok: true, data: TEST_LINK });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLを発行する' }));

      await waitFor(() => {
        const urlInput = screen.getByRole('textbox', { name: '共有URL' });
        expect((urlInput as HTMLInputElement).value).toContain(TOKEN);
      });
    });

    it('createShareLink 失敗時にエラーメッセージが表示されること', async () => {
      const errorMessage = 'このツリーの共有リンクは既に存在します';
      mockCreateShareLink.mockResolvedValue({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: errorMessage },
      });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLを発行する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
      });
    });

    it('createShareLink 失敗後も「共有URLを発行する」ボタンが残ること', async () => {
      mockCreateShareLink.mockResolvedValue({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: 'エラー' },
      });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={null} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLを発行する' }));

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '共有URLを発行する' })
        ).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // B. initialLink !== null の場合 (共有 URL 表示 UI)
  // ---------------------------------------------------------------------------
  describe('initialLink !== null の場合（共有 URL 表示 UI）', () => {
    it('input に ${origin}/share/${token} の URL が表示されること', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      const urlInput = screen.getByRole('textbox', { name: '共有URL' }) as HTMLInputElement;
      expect(urlInput.value).toBe(`http://localhost/share/${TOKEN}`);
    });

    it('「コピー」ボタンが表示されること', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      expect(
        screen.getByRole('button', { name: '共有URLをコピー' })
      ).toBeInTheDocument();
    });

    it('「無効化する」ボタンが表示されること', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      expect(
        screen.getByRole('button', { name: '無効化する' })
      ).toBeInTheDocument();
    });

    it('「共有URLを発行する」ボタンが表示されないこと', () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      expect(
        screen.queryByRole('button', { name: '共有URLを発行する' })
      ).not.toBeInTheDocument();
    });

    // --- コピーボタン ---
    it('「コピー」ボタン押下で navigator.clipboard.writeText が呼ばれること', async () => {
      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLをコピー' }));

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(`http://localhost/share/${TOKEN}`);
      });
    });

    it('コピー成功時に「✓ コピーしました」が表示されること', async () => {
      mockWriteText.mockResolvedValue(undefined);

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLをコピー' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('✓ コピーしました');
      });
    });

    // --- 無効化ボタン ---
    it('「無効化する」押下で window.confirm が呼ばれること', async () => {
      confirmSpy.mockReturnValue(false);

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      expect(confirmSpy).toHaveBeenCalled();
    });

    it('confirm キャンセル時 revokeShareLink が呼ばれないこと', async () => {
      confirmSpy.mockReturnValue(false);

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      expect(mockRevokeShareLink).not.toHaveBeenCalled();
    });

    it('confirm OK 時 revokeShareLink({ linkId }) が呼ばれること', async () => {
      confirmSpy.mockReturnValue(true);
      mockRevokeShareLink.mockResolvedValue({ ok: true, data: undefined });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      await waitFor(() => {
        expect(mockRevokeShareLink).toHaveBeenCalledWith({ linkId: LINK_ID });
      });
    });

    it('revokeShareLink 成功時に発行 UI に戻ること（link state を null）', async () => {
      confirmSpy.mockReturnValue(true);
      mockRevokeShareLink.mockResolvedValue({ ok: true, data: undefined });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '共有URLを発行する' })
        ).toBeInTheDocument();
      });

      // 共有 URL 表示 UI が消えること
      expect(
        screen.queryByRole('textbox', { name: '共有URL' })
      ).not.toBeInTheDocument();
    });

    it('revokeShareLink 失敗時にエラーメッセージが表示されること', async () => {
      const errorMessage = '共有リンクの無効化に失敗しました';
      confirmSpy.mockReturnValue(true);
      mockRevokeShareLink.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: errorMessage },
      });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
      });
    });

    it('revokeShareLink 失敗後も「無効化する」ボタンが残ること', async () => {
      confirmSpy.mockReturnValue(true);
      mockRevokeShareLink.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'エラー' },
      });

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '無効化する' }));

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '無効化する' })
        ).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // C. クリップボード API フォールバック
  // ---------------------------------------------------------------------------
  describe('クリップボード API フォールバック', () => {
    it('navigator.clipboard.writeText が reject した場合に textarea + execCommand フォールバックが動作すること', async () => {
      // writeText を reject させる
      mockWriteText.mockRejectedValue(new Error('clipboard not available'));

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLをコピー' }));

      await waitFor(() => {
        expect(execCommandMock).toHaveBeenCalledWith('copy');
      });
    });

    it('フォールバック成功後もコピー成功メッセージが表示されること', async () => {
      mockWriteText.mockRejectedValue(new Error('clipboard not available'));

      render(<ShareLinkPanel treeId={TREE_ID} initialLink={TEST_LINK} />);

      await userEvent.click(screen.getByRole('button', { name: '共有URLをコピー' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('✓ コピーしました');
      });
    });
  });
});
