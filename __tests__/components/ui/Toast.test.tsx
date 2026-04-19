/**
 * Toast / ToastProvider のテスト
 *
 * テスト観点:
 * - ToastProvider でラップすると useToast() が機能する
 * - success/error/warning/info で Toast が表示される
 * - role="alert" (error) / role="status" (その他) が付与される
 * - 閉じるボタンで dismiss できる
 * - 自動消去: jest.useFakeTimers() で時間を進めて確認
 * - duration: 0 で自動消去しない
 * - dismiss(id) で指定した Toast が消える
 * - Provider 外で useToast() を呼ぶとエラー
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/components/ui/Toast/ToastProvider';

// useToast を使うテスト用コンポーネント
function ToastTrigger({
  variant,
  message,
  duration,
}: {
  variant: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}) {
  const toast = useToast();
  return (
    <button
      onClick={() => toast[variant](message, duration)}
      data-testid="trigger"
    >
      表示
    </button>
  );
}

function DismissTrigger({ id }: { id: string }) {
  const toast = useToast();
  return (
    <button onClick={() => toast.dismiss(id)} data-testid="dismiss-trigger">
      dismiss
    </button>
  );
}

function DismissById() {
  const toast = useToast();
  const [toastId, setToastId] = React.useState<string | null>(null);
  return (
    <>
      <button
        onClick={() => {
          const id = toast.success('消えるトースト', 0);
          setToastId(id);
        }}
        data-testid="show"
      >
        表示
      </button>
      <button
        onClick={() => {
          if (toastId) toast.dismiss(toastId);
        }}
        data-testid="dismiss-by-id"
      >
        dismiss by id
      </button>
    </>
  );
}

describe('Toast / ToastProvider', () => {
  describe('ToastProvider', () => {
    it('ToastProvider でラップすると useToast() がエラーを投げない', () => {
      expect(() => {
        render(
          <ToastProvider>
            <ToastTrigger variant="success" message="テスト" />
          </ToastProvider>
        );
      }).not.toThrow();
    });
  });

  describe('各 variant の Toast 表示', () => {
    it.each([
      ['success', 'role="status"'],
      ['warning', 'role="status"'],
      ['info', 'role="status"'],
    ] as const)('%s で Toast が表示される (role="status")', async (variant) => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger variant={variant} message={`${variant}メッセージ`} duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(`${variant}メッセージ`);
    });

    it('error で Toast が表示される (role="alert")', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger variant="error" message="エラーメッセージ" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('エラーメッセージ');
    });
  });

  describe('閉じるボタンで dismiss', () => {
    it('閉じるボタンクリックで Toast が消える', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger variant="success" message="消えるはず" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('status')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '通知を閉じる' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('自動消去', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('duration 経過後に自動消去される', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <ToastTrigger variant="info" message="自動消去テスト" duration={3000} />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('status')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('duration=0 のとき自動消去されない', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <ToastTrigger variant="info" message="消えないトースト" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('status')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(60000);
      });
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('dismiss(id) による個別消去', () => {
    it('dismiss(id) で指定した Toast が消える', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <DismissById />
        </ToastProvider>
      );
      await user.click(screen.getByTestId('show'));
      expect(screen.getByRole('status')).toBeInTheDocument();

      await user.click(screen.getByTestId('dismiss-by-id'));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('Provider 外での useToast()', () => {
    it('ToastProvider の外で useToast() を呼ぶとエラーを投げる', () => {
      function OutsideConsumer() {
        useToast();
        return null;
      }

      // React の error boundary をバイパスするため console.error を抑制
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<OutsideConsumer />);
      }).toThrow('useToast は ToastProvider の内側で使用してください');

      consoleSpy.mockRestore();
    });
  });
});
