/**
 * PersonForm コンポーネントのテスト
 *
 * テスト観点:
 * - 全フィールドが render される
 * - displayName 必須バリデーション
 * - displayName 201文字バリデーション
 * - 曖昧日付バリデーション（年なしで月入力）
 * - 年月日すべて正しい入力で送信成功
 * - isAlive チェック時、death フィールドが非表示
 * - isAlive チェック外し時、death フィールドが表示
 * - defaultValues が反映される（編集モード）
 * - onSubmit が呼ばれる（正常フロー）
 * - onCancel が呼ばれる
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonForm, PersonFormValues } from '@/features/person/components/PersonForm';

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

describe('PersonForm', () => {
  let mockOnSubmit: jest.Mock;

  beforeEach(() => {
    mockOnSubmit = jest.fn().mockResolvedValue(undefined);
  });

  /* ================================================================ */
  /* フィールドの存在確認                                               */
  /* ================================================================ */

  describe('フィールドの存在確認', () => {
    it('表示名フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('displayName')).toBeInTheDocument();
    });

    it('姓フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('familyName')).toBeInTheDocument();
    });

    it('名フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('givenName')).toBeInTheDocument();
    });

    it('旧姓フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('maidenName')).toBeInTheDocument();
    });

    it('性別セレクトが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(document.getElementById('gender')).toBeInTheDocument();
    });

    it('生年（年）フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('birthYear')).toBeInTheDocument();
    });

    it('生年月日（月）フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('birthMonth')).toBeInTheDocument();
    });

    it('生年月日（日）フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('birthDay')).toBeInTheDocument();
    });

    it('出生地フィールドが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('birthPlace')).toBeInTheDocument();
    });

    it('存命中チェックボックスが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(screen.getByText('存命中')).toBeInTheDocument();
    });

    it('メモテキストエリアが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(document.getElementById('note')).toBeInTheDocument();
    });

    it('送信ボタンが存在する', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* isAlive による死亡情報フィールドの表示/非表示                     */
  /* ================================================================ */

  describe('isAlive による表示切り替え', () => {
    it('デフォルト（isAlive=true）では死亡関連フィールドは表示されない', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(getInput('deathYear')).not.toBeInTheDocument();
      expect(getInput('deathMonth')).not.toBeInTheDocument();
      expect(getInput('deathDay')).not.toBeInTheDocument();
      expect(getInput('deathPlace')).not.toBeInTheDocument();
    });

    it('存命中チェックを外すと死亡関連フィールドが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(checkbox);
      await waitFor(() => {
        expect(getInput('deathYear')).toBeInTheDocument();
      });
      expect(getInput('deathMonth')).toBeInTheDocument();
      expect(getInput('deathDay')).toBeInTheDocument();
      expect(getInput('deathPlace')).toBeInTheDocument();
    });

    it('defaultValues で isAlive=false を渡すと死亡フィールドが表示される', () => {
      render(
        <PersonForm
          onSubmit={mockOnSubmit}
          defaultValues={{ isAlive: false }}
        />
      );
      expect(getInput('deathYear')).toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* バリデーション                                                     */
  /* ================================================================ */

  describe('バリデーション', () => {
    it('表示名が空のまま送信 → エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('名前を入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('表示名が空のとき onSubmit は呼ばれない', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('名前を入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('表示名 201文字 → エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      const longName = 'a'.repeat(201);
      await user.type(getInput('displayName'), longName);
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('名前は200文字以内で入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('表示名 200文字はエラーにならない', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      const maxName = 'a'.repeat(200);
      await user.type(getInput('displayName'), maxName);
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
      expect(screen.queryByText('名前は200文字以内で入力してください')).not.toBeInTheDocument();
    });

    it('生年の年なしで月入力 → 曖昧日付エラーが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.type(getInput('birthMonth'), '3');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('生年月日は年から順に入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('生年の月なしで日入力 → 曖昧日付エラーが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.type(getInput('birthYear'), '1980');
      await user.type(getInput('birthDay'), '15');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('日を入力する場合は月も入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('没年月日のバリデーション', () => {
    it('没年なしで没月入力 → 曖昧日付エラーが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      // isAlive のデフォルトは true のため、チェックボックスを外して死亡フィールドを表示
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(checkbox);
      await waitFor(() => {
        expect(getInput('deathMonth')).toBeInTheDocument();
      });
      await user.type(getInput('displayName'), '田中 太郎');
      await user.type(getInput('deathMonth'), '3');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('没年月日は年から順に入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('没月なしで没日入力 → エラーが表示される', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      // isAlive のデフォルトは true のため、チェックボックスを外して死亡フィールドを表示
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await user.click(checkbox);
      await waitFor(() => {
        expect(getInput('deathYear')).toBeInTheDocument();
      });
      await user.type(getInput('displayName'), '田中 太郎');
      await user.type(getInput('deathYear'), '2020');
      await user.type(getInput('deathDay'), '15');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        const errors = screen.getAllByText('日を入力する場合は月も入力してください');
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  /* ================================================================ */
  /* 正常送信                                                           */
  /* ================================================================ */

  describe('正常送信', () => {
    it('表示名のみ入力で onSubmit が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it('isAlive=true がデフォルトで onSubmit 引数に含まれる', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            isAlive: true,
          })
        );
      });
    });

    it('表示名と生年月日を入力して onSubmit が displayName と birthYear/Month/Day で呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PersonForm onSubmit={mockOnSubmit} />);
      await user.type(getInput('displayName'), '田中 太郎');
      await user.type(getInput('birthYear'), '1980');
      await user.type(getInput('birthMonth'), '3');
      await user.type(getInput('birthDay'), '15');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: '田中 太郎',
            birthYear: 1980,
            birthMonth: 3,
            birthDay: 15,
          })
        );
      });
    });
  });

  /* ================================================================ */
  /* defaultValues（編集モード）                                        */
  /* ================================================================ */

  describe('defaultValues の反映', () => {
    const defaultValues: Partial<PersonFormValues> = {
      displayName: '山田 花子',
      familyName: '山田',
      givenName: '花子',
      birthYear: 1985,
      birthMonth: 7,
      birthDay: 20,
      isAlive: true,
    };

    it('displayName が defaultValues から反映される', () => {
      render(<PersonForm onSubmit={mockOnSubmit} defaultValues={defaultValues} />);
      expect(getInput('displayName')).toHaveValue('山田 花子');
    });

    it('familyName が defaultValues から反映される', () => {
      render(<PersonForm onSubmit={mockOnSubmit} defaultValues={defaultValues} />);
      expect(getInput('familyName')).toHaveValue('山田');
    });

    it('birthYear が defaultValues から反映される', () => {
      render(<PersonForm onSubmit={mockOnSubmit} defaultValues={defaultValues} />);
      expect(getInput('birthYear')).toHaveValue(1985);
    });
  });

  /* ================================================================ */
  /* キャンセルボタン                                                   */
  /* ================================================================ */

  describe('キャンセルボタン', () => {
    it('onCancel を渡すとキャンセルボタンが表示される', () => {
      const mockOnCancel = jest.fn();
      render(<PersonForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('onCancel を渡さないとキャンセルボタンが表示されない', () => {
      render(<PersonForm onSubmit={mockOnSubmit} />);
      expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument();
    });

    it('キャンセルボタンをクリックすると onCancel が呼ばれる', async () => {
      const user = userEvent.setup();
      const mockOnCancel = jest.fn();
      render(<PersonForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* submitLabel                                                        */
  /* ================================================================ */

  describe('submitLabel', () => {
    it('submitLabel を渡すとそのラベルのボタンが表示される', () => {
      render(<PersonForm onSubmit={mockOnSubmit} submitLabel="追加" />);
      expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();
    });
  });
});
