/**
 * OnboardingPageClient コンポーネントのテスト
 *
 * テスト観点:
 * - localStorage に完了フラグがある場合 → リダイレクト・ウィザード非表示
 * - localStorage に完了フラグがない場合 → OnboardingWizard 表示
 * - 異なる treeId での独立性（treeA 完了でも treeB は表示）
 */

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// OnboardingWizard を軽量スタブに差し替え（自コンポーネント以外の影響を排除）
jest.mock('../OnboardingWizard', () => ({
  OnboardingWizard: function MockOnboardingWizard({ treeId }: { treeId: string }) {
    return <div data-testid="onboarding-wizard" data-tree-id={treeId} />;
  },
}));

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { OnboardingPageClient } from '../OnboardingPageClient';
import { getCompletionKey } from '../../lib/completion-key';

const mockReplace = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

function setupRouter() {
  mockUseRouter.mockReturnValue({
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: mockReplace,
    prefetch: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('OnboardingPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
    // localStorage をクリア
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // 完了フラグなし（ウィザード表示）
  // ---------------------------------------------------------------------------
  describe('完了フラグなし', () => {
    it('localStorage に完了フラグがない場合、OnboardingWizard が表示されること', () => {
      render(<OnboardingPageClient treeId="tree-123" />);

      expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    });

    it('localStorage に完了フラグがない場合、OnboardingWizard に正しい treeId が渡されること', () => {
      render(<OnboardingPageClient treeId="tree-456" />);

      const wizard = screen.getByTestId('onboarding-wizard');
      expect(wizard).toHaveAttribute('data-tree-id', 'tree-456');
    });

    it('localStorage に完了フラグがない場合、router.replace は呼ばれないこと', () => {
      render(<OnboardingPageClient treeId="tree-123" />);

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 完了フラグあり（リダイレクト）
  // ---------------------------------------------------------------------------
  describe('完了フラグあり', () => {
    it('localStorage に完了フラグがある場合、router.replace が /trees/[treeId] で呼ばれること', async () => {
      localStorage.setItem(getCompletionKey('tree-123'), 'true');

      await act(async () => {
        render(<OnboardingPageClient treeId="tree-123" />);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/trees/tree-123');
      });
    });

    it('localStorage に完了フラグがある場合、OnboardingWizard が表示されないこと', async () => {
      localStorage.setItem(getCompletionKey('tree-999'), 'true');

      await act(async () => {
        render(<OnboardingPageClient treeId="tree-999" />);
      });

      expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
    });

    it('localStorage に完了フラグがある場合、ローディング表示がされること', async () => {
      localStorage.setItem(getCompletionKey('tree-abc'), 'true');

      await act(async () => {
        render(<OnboardingPageClient treeId="tree-abc" />);
      });

      expect(screen.getByLabelText('読み込み中')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 異なる treeId の独立性
  // ---------------------------------------------------------------------------
  describe('treeId の独立性', () => {
    it('treeA の完了フラグがあっても treeB ではウィザードが表示されること', () => {
      localStorage.setItem(getCompletionKey('tree-a'), 'true');

      render(<OnboardingPageClient treeId="tree-b" />);

      expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-wizard')).toHaveAttribute('data-tree-id', 'tree-b');
    });

    it('treeA の完了フラグがあっても treeB では router.replace が呼ばれないこと', () => {
      localStorage.setItem(getCompletionKey('tree-a'), 'true');

      render(<OnboardingPageClient treeId="tree-b" />);

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('複数の treeId がそれぞれ独立した完了状態を持つこと', async () => {
      localStorage.setItem(getCompletionKey('tree-a'), 'true');
      localStorage.setItem(getCompletionKey('tree-b'), 'true');

      await act(async () => {
        render(<OnboardingPageClient treeId="tree-a" />);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/trees/tree-a');
      });
    });

    it('完了フラグの値が "true" でない場合はウィザードが表示されること', () => {
      localStorage.setItem(getCompletionKey('tree-x'), 'false');

      render(<OnboardingPageClient treeId="tree-x" />);

      expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    });
  });
});
