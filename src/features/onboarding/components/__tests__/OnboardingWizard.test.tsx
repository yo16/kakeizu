/**
 * OnboardingWizard コンポーネントのテスト
 *
 * テスト観点:
 * - 初期表示は Self ステップ
 * - Self → Spouse → Children → 完了 の遷移
 * - ヘッダーのスキップボタンが全ステップで表示される
 * - ヘッダースキップで localStorage.setItem + router.push が呼ばれる
 * - handleComplete でも localStorage.setItem + router.push が呼ばれる
 */

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// 各ステップを軽量スタブに差し替え
jest.mock('../WizardStepSelf', () => ({
  WizardStepSelf: function MockWizardStepSelf({
    treeId,
    onComplete,
  }: {
    treeId: string;
    onComplete: (personId: string) => void;
  }) {
    return (
      <div data-testid="wizard-step-self" data-tree-id={treeId}>
        <button
          type="button"
          onClick={() => onComplete('person-from-self')}
        >
          SelfComplete
        </button>
      </div>
    );
  },
}));

jest.mock('../WizardStepSpouse', () => ({
  WizardStepSpouse: function MockWizardStepSpouse({
    originPersonId,
    onComplete,
    onSkip,
  }: {
    originPersonId: string;
    onComplete: () => void;
    onSkip: () => void;
  }) {
    return (
      <div data-testid="wizard-step-spouse" data-origin-person-id={originPersonId}>
        <button type="button" onClick={onComplete}>SpouseComplete</button>
        <button type="button" onClick={onSkip}>SpouseSkip</button>
      </div>
    );
  },
}));

jest.mock('../WizardStepChildren', () => ({
  WizardStepChildren: function MockWizardStepChildren({
    originPersonId,
    onComplete,
  }: {
    originPersonId: string;
    onComplete: () => void;
  }) {
    return (
      <div data-testid="wizard-step-children" data-origin-person-id={originPersonId}>
        <button type="button" onClick={onComplete}>ChildrenComplete</button>
      </div>
    );
  },
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { OnboardingWizard } from '../OnboardingWizard';
import { getCompletionKey } from '../../lib/completion-key';

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

function setupRouter() {
  mockUseRouter.mockReturnValue({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRouter();
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // 初期表示
  // ---------------------------------------------------------------------------
  describe('初期表示', () => {
    it('初期表示では Self ステップが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.getByTestId('wizard-step-self')).toBeInTheDocument();
    });

    it('初期表示では Spouse ステップは表示されないこと', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.queryByTestId('wizard-step-spouse')).not.toBeInTheDocument();
    });

    it('初期表示では Children ステップは表示されないこと', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.queryByTestId('wizard-step-children')).not.toBeInTheDocument();
    });

    it('ウィザードのタイトル「家系図へようこそ」が表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.getByText('家系図へようこそ')).toBeInTheDocument();
    });

    it('進捗インジケータが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.getByLabelText(/ステップ 1 \/ 3/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ステップ遷移
  // ---------------------------------------------------------------------------
  describe('ステップ遷移', () => {
    it('Self 完了後に Spouse ステップへ遷移すること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));

      expect(screen.getByTestId('wizard-step-spouse')).toBeInTheDocument();
      expect(screen.queryByTestId('wizard-step-self')).not.toBeInTheDocument();
    });

    it('Self 完了後、Spouse ステップに originPersonId が渡されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));

      expect(screen.getByTestId('wizard-step-spouse')).toHaveAttribute(
        'data-origin-person-id',
        'person-from-self'
      );
    });

    it('Spouse 完了後に Children ステップへ遷移すること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));

      expect(screen.getByTestId('wizard-step-children')).toBeInTheDocument();
      expect(screen.queryByTestId('wizard-step-spouse')).not.toBeInTheDocument();
    });

    it('Spouse スキップ後に Children ステップへ遷移すること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseSkip'));

      expect(screen.getByTestId('wizard-step-children')).toBeInTheDocument();
    });

    it('Children ステップに originPersonId が渡されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));

      expect(screen.getByTestId('wizard-step-children')).toHaveAttribute(
        'data-origin-person-id',
        'person-from-self'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // スキップボタン
  // ---------------------------------------------------------------------------
  describe('スキップボタン', () => {
    it('Self ステップでスキップボタンが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(
        screen.getByRole('button', { name: 'オンボーディングをスキップしてツリー画面へ' })
      ).toBeInTheDocument();
    });

    it('Spouse ステップでもスキップボタンが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));

      expect(
        screen.getByRole('button', { name: 'オンボーディングをスキップしてツリー画面へ' })
      ).toBeInTheDocument();
    });

    it('Children ステップでもスキップボタンが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));

      expect(
        screen.getByRole('button', { name: 'オンボーディングをスキップしてツリー画面へ' })
      ).toBeInTheDocument();
    });

    it('スキップボタンを押すと localStorage に完了フラグが保存されること', () => {
      render(<OnboardingWizard treeId="tree-xyz" />);

      fireEvent.click(
        screen.getByRole('button', { name: 'オンボーディングをスキップしてツリー画面へ' })
      );

      expect(localStorage.getItem(getCompletionKey('tree-xyz'))).toBe('true');
    });

    it('スキップボタンを押すと router.push("/trees/{treeId}") が呼ばれること', () => {
      render(<OnboardingWizard treeId="tree-xyz" />);

      fireEvent.click(
        screen.getByRole('button', { name: 'オンボーディングをスキップしてツリー画面へ' })
      );

      expect(mockPush).toHaveBeenCalledWith('/trees/tree-xyz');
    });
  });

  // ---------------------------------------------------------------------------
  // handleComplete (Children 完了)
  // ---------------------------------------------------------------------------
  describe('handleComplete (Children 完了)', () => {
    it('Children 完了で localStorage に完了フラグが保存されること', () => {
      render(<OnboardingWizard treeId="tree-complete" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));
      fireEvent.click(screen.getByText('ChildrenComplete'));

      expect(localStorage.getItem(getCompletionKey('tree-complete'))).toBe('true');
    });

    it('Children 完了で router.push("/trees/{treeId}") が呼ばれること', () => {
      render(<OnboardingWizard treeId="tree-complete" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));
      fireEvent.click(screen.getByText('ChildrenComplete'));

      expect(mockPush).toHaveBeenCalledWith('/trees/tree-complete');
    });
  });

  // ---------------------------------------------------------------------------
  // ステップラベル表示
  // ---------------------------------------------------------------------------
  describe('ステップラベル', () => {
    it('Self ステップでステップタイトル「あなたの情報」が表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      expect(screen.getByRole('heading', { level: 2, name: 'あなたの情報' })).toBeInTheDocument();
    });

    it('Spouse ステップへ遷移後「配偶者」のタイトルが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));

      expect(screen.getByRole('heading', { level: 2, name: '配偶者' })).toBeInTheDocument();
    });

    it('Children ステップへ遷移後「子ども」のタイトルが表示されること', () => {
      render(<OnboardingWizard treeId="tree-123" />);

      fireEvent.click(screen.getByText('SelfComplete'));
      fireEvent.click(screen.getByText('SpouseComplete'));

      expect(screen.getByRole('heading', { level: 2, name: '子ども' })).toBeInTheDocument();
    });
  });
});
