/**
 * RelationDialog コンポーネントのテスト
 *
 * テスト観点:
 * - ダイアログの表示/非表示制御
 * - ステップ遷移 (kind → person1 → person2 → detail → confirm)
 * - 人物インクリメンタル検索
 * - 関係種別に応じたフォームフィールド切り替え
 * - 親子関係の詳細入力 (親の役割)
 * - 婚姻関係の詳細入力 (婚姻種別/状態/年月)
 * - 年月バリデーション
 * - Server Action の呼び出し引数確認
 * - 成功/エラー時のトースト表示
 * - 戻る/キャンセルボタンの動作
 * - 送信中のボタン無効化
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelationDialog } from '@/features/relation/components/RelationDialog';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/person/actions', () => ({
  getPersonsByTree: jest.fn(),
}));

jest.mock('@/features/relation/actions', () => ({
  createParentChild: jest.fn(),
  createMarriage: jest.fn(),
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

import { getPersonsByTree } from '@/features/person/actions';
import { createParentChild, createMarriage } from '@/features/relation/actions';

const mockGetPersonsByTree = getPersonsByTree as jest.MockedFunction<typeof getPersonsByTree>;
const mockCreateParentChild = createParentChild as jest.MockedFunction<typeof createParentChild>;
const mockCreateMarriage = createMarriage as jest.MockedFunction<typeof createMarriage>;

/* ------------------------------------------------------------------ */
/* テスト用フィクスチャ                                                 */
/* ------------------------------------------------------------------ */

const PERSONS = [
  { id: 'person-a', displayName: '山田 太郎', birthYear: 1980, gender: 'male' },
  { id: 'person-b', displayName: '山田 花子', birthYear: 1983, gender: 'female' },
  { id: 'person-c', displayName: '鈴木 一郎', birthYear: 2005, gender: 'male' },
];

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: jest.fn(),
  treeId: 'tree-001',
  onSuccess: jest.fn(),
};

/* ------------------------------------------------------------------ */
/* ヘルパー: ダイアログを開いてperson一覧が読み込まれるまで待つ        */
/* ------------------------------------------------------------------ */

async function renderAndWaitForLoad(props = DEFAULT_PROPS) {
  mockGetPersonsByTree.mockResolvedValue({ ok: true, data: PERSONS });
  const user = userEvent.setup();
  render(<RelationDialog {...props} />);
  // 人物一覧取得を待つ
  await waitFor(() => expect(mockGetPersonsByTree).toHaveBeenCalledWith(props.treeId));
  return { user };
}

/** 親子関係ステップをperson選択まで進めるヘルパー */
async function advanceToDetailStep_parentChild(user: ReturnType<typeof userEvent.setup>) {
  // ステップ1: 親子関係を選択
  await user.click(screen.getByRole('button', { name: /親子関係/ }));
  // ステップ2: 親（1人目）を選択
  await waitFor(() => screen.getByRole('option', { name: /山田 太郎/ }));
  await user.click(screen.getByRole('option', { name: /山田 太郎/ }));
  // ステップ3: 子（2人目）を選択（山田 太郎は除外されているはず）
  await waitFor(() => screen.getByRole('option', { name: /山田 花子/ }));
  await user.click(screen.getByRole('option', { name: /山田 花子/ }));
  // ステップ4: 詳細入力
  await waitFor(() => screen.getByText(/詳細を入力/));
}

/** 婚姻関係ステップをperson選択まで進めるヘルパー */
async function advanceToDetailStep_marriage(user: ReturnType<typeof userEvent.setup>) {
  // ステップ1: 婚姻関係を選択
  await user.click(screen.getByRole('button', { name: /婚姻関係/ }));
  // ステップ2: 1人目を選択
  await waitFor(() => screen.getByRole('option', { name: /山田 太郎/ }));
  await user.click(screen.getByRole('option', { name: /山田 太郎/ }));
  // ステップ3: 2人目を選択
  await waitFor(() => screen.getByRole('option', { name: /山田 花子/ }));
  await user.click(screen.getByRole('option', { name: /山田 花子/ }));
  // ステップ4: 詳細入力
  await waitFor(() => screen.getByText(/詳細を入力/));
}

/* ================================================================== */
/* テストスイート                                                       */
/* ================================================================== */

describe('RelationDialog', () => {
  beforeEach(() => {
    mockGetPersonsByTree.mockReset();
    mockCreateParentChild.mockReset();
    mockCreateMarriage.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    (DEFAULT_PROPS.onClose as jest.Mock).mockReset();
    (DEFAULT_PROPS.onSuccess as jest.Mock).mockReset();
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 表示制御                                                  */
  /* ---------------------------------------------------------------- */

  describe('表示制御', () => {
    it('TC-01: ダイアログが閉じている時は何も表示されない', () => {
      render(
        <RelationDialog
          isOpen={false}
          onClose={jest.fn()}
          treeId="tree-001"
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('TC-02: ダイアログを開いた初期状態では「関係種別選択」ステップが表示される', async () => {
      mockGetPersonsByTree.mockResolvedValue({ ok: true, data: PERSONS });
      render(<RelationDialog {...DEFAULT_PROPS} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByText(/関係種別を選択/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /親子関係/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /婚姻関係/ })).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: ステップ遷移                                              */
  /* ---------------------------------------------------------------- */

  describe('ステップ遷移', () => {
    it('TC-03: 「親子関係」ボタンをクリックすると1人目選択ステップに進む', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: /親子関係/ }));
      await waitFor(() => {
        expect(screen.getByText('親となる人物を選択してください。')).toBeInTheDocument();
      });
    });

    it('TC-04: 「婚姻関係」ボタンをクリックすると1人目選択ステップに進む', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: /婚姻関係/ }));
      await waitFor(() => {
        expect(screen.getByText('1人目の人物を選択してください。')).toBeInTheDocument();
      });
    });

    it('TC-06: 人物1を選択すると人物2選択ステップに進み、選択済み人物は除外される', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: /親子関係/ }));
      await waitFor(() => screen.getByRole('option', { name: /山田 太郎/ }));
      await user.click(screen.getByRole('option', { name: /山田 太郎/ }));

      await waitFor(() => {
        // 「子を選択」ステップに進む
        expect(screen.getByText('子となる人物を選択してください。')).toBeInTheDocument();
      });
      // 選択済みの山田 太郎がリストに表示されないことを確認
      const listbox = screen.getByRole('listbox', { name: '子' });
      expect(within(listbox).queryByText('山田 太郎')).not.toBeInTheDocument();
      // 山田 花子は選択可能
      expect(within(listbox).getByText('山田 花子')).toBeInTheDocument();
    });

    it('TC-07: 人物2を選択すると詳細入力ステップに進む', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);
      expect(screen.getByText(/詳細を入力/)).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 人物検索                                                  */
  /* ---------------------------------------------------------------- */

  describe('人物検索', () => {
    it('TC-05: 検索フィールドに入力すると人物リストが絞り込まれる', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: /親子関係/ }));

      await waitFor(() => screen.getByRole('listbox', { name: '親' }));
      const listbox = screen.getByRole('listbox', { name: '親' });

      // 初期状態では全員表示
      expect(within(listbox).getByText('山田 太郎')).toBeInTheDocument();
      expect(within(listbox).getByText('山田 花子')).toBeInTheDocument();
      expect(within(listbox).getByText('鈴木 一郎')).toBeInTheDocument();

      // 「鈴木」で絞り込む
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, '鈴木');

      await waitFor(() => {
        expect(within(listbox).queryByText('山田 太郎')).not.toBeInTheDocument();
        expect(within(listbox).queryByText('山田 花子')).not.toBeInTheDocument();
        expect(within(listbox).getByText('鈴木 一郎')).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 詳細入力 — 親子関係                                       */
  /* ---------------------------------------------------------------- */

  describe('詳細入力 — 親子関係', () => {
    it('TC-08: 親の役割ラジオボタン (biological/adoptive/step) が選択できる', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);

      const biologicalRadio = screen.getByRole('radio', { name: '実親' });
      const adoptiveRadio = screen.getByRole('radio', { name: '養親' });
      const stepRadio = screen.getByRole('radio', { name: '義親' });

      // 初期値は実親
      expect(biologicalRadio).toBeChecked();
      expect(adoptiveRadio).not.toBeChecked();

      // 養親を選択
      await user.click(adoptiveRadio);
      expect(adoptiveRadio).toBeChecked();
      expect(biologicalRadio).not.toBeChecked();

      // 義親を選択
      await user.click(stepRadio);
      expect(stepRadio).toBeChecked();
    });

    it('TC-08b: 親子関係の詳細では年月入力フィールドが表示されない', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);

      expect(screen.queryByLabelText(/開始年月/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/終了年月/)).not.toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 詳細入力 — 婚姻関係                                       */
  /* ---------------------------------------------------------------- */

  describe('詳細入力 — 婚姻関係', () => {
    it('TC-09: 婚姻種別ラジオボタンが選択できる', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      const spouseRadio = screen.getByRole('radio', { name: '配偶者' });
      const commonLawRadio = screen.getByRole('radio', { name: '事実婚' });

      // 初期値は配偶者
      expect(spouseRadio).toBeChecked();

      // 事実婚を選択
      await user.click(commonLawRadio);
      expect(commonLawRadio).toBeChecked();
      expect(spouseRadio).not.toBeChecked();
    });

    it('TC-09b: 婚姻状態ラジオボタンが選択できる', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      const currentRadio = screen.getByRole('radio', { name: '婚姻中' });
      const divorcedRadio = screen.getByRole('radio', { name: '離婚' });

      // 初期値は婚姻中
      expect(currentRadio).toBeChecked();

      // 離婚を選択
      await user.click(divorcedRadio);
      expect(divorcedRadio).toBeChecked();
      expect(currentRadio).not.toBeChecked();
    });

    it('TC-09c: 婚姻関係の詳細では開始年月・終了年月の入力フィールドが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      expect(screen.getByLabelText('開始年月 (任意)（年）')).toBeInTheDocument();
      expect(screen.getByLabelText('開始年月 (任意)（月）')).toBeInTheDocument();
      expect(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（年）')).toBeInTheDocument();
      expect(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（月）')).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 確認ステップ                                              */
  /* ---------------------------------------------------------------- */

  describe('確認ステップ', () => {
    it('TC-10: 親子関係の確認ステップで入力内容が正しく表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);

      // 養親を選択してから次へ
      await user.click(screen.getByRole('radio', { name: '養親' }));
      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => screen.getByText(/確認/));

      expect(screen.getByText('親子関係')).toBeInTheDocument();
      expect(screen.getByText('山田 太郎')).toBeInTheDocument();
      expect(screen.getByText('山田 花子')).toBeInTheDocument();
      expect(screen.getByText('養親')).toBeInTheDocument();
    });

    it('TC-10b: 婚姻関係の確認ステップで入力内容が正しく表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      // 事実婚・離婚に変更して年月入力
      await user.click(screen.getByRole('radio', { name: '事実婚' }));
      await user.click(screen.getByRole('radio', { name: '離婚' }));
      await user.type(screen.getByLabelText('開始年月 (任意)（年）'), '2010');
      await user.type(screen.getByLabelText('開始年月 (任意)（月）'), '3');
      await user.type(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（年）'), '2020');

      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => screen.getByText(/確認/));

      expect(screen.getByText('婚姻関係')).toBeInTheDocument();
      expect(screen.getByText('山田 太郎')).toBeInTheDocument();
      expect(screen.getByText('山田 花子')).toBeInTheDocument();
      expect(screen.getByText('事実婚')).toBeInTheDocument();
      expect(screen.getByText('離婚')).toBeInTheDocument();
      expect(screen.getByText('2010年3月')).toBeInTheDocument();
      expect(screen.getByText('2020年')).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 作成実行                                                  */
  /* ---------------------------------------------------------------- */

  describe('作成実行', () => {
    it('TC-11a: 「作成する」ボタンで createParentChild が正しい引数で呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({ ok: true, data: { relationId: 'rel-001' } });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);

      // 実親（デフォルト）で次へ
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockCreateParentChild).toHaveBeenCalledWith({
          parentId: 'person-a',
          childId: 'person-b',
          parentRole: 'biological',
        });
      });
    });

    it('TC-11b: 「作成する」ボタンで createMarriage が正しい引数で呼ばれる', async () => {
      mockCreateMarriage.mockResolvedValue({ ok: true, data: { relationId: 'rel-002' } });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.type(screen.getByLabelText('開始年月 (任意)（年）'), '2015');
      await user.type(screen.getByLabelText('開始年月 (任意)（月）'), '6');

      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockCreateMarriage).toHaveBeenCalledWith({
          partnerAId: 'person-a',
          partnerBId: 'person-b',
          type: 'spouse',
          status: 'current',
          startYear: 2015,
          startMonth: 6,
          endYear: null,
          endMonth: null,
        });
      });
    });

    it('TC-12: 成功時にトーストが表示され、onSuccess と onClose が呼ばれる', async () => {
      mockCreateParentChild.mockResolvedValue({ ok: true, data: { relationId: 'rel-003' } });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('関係を作成しました');
        expect(DEFAULT_PROPS.onSuccess).toHaveBeenCalledWith('rel-003');
        expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 異常系                                                            */
  /* ---------------------------------------------------------------- */

  describe('異常系', () => {
    it('TC-13: 重複関係エラー (RELATION_CONFLICT) でエラートーストが表示される', async () => {
      mockCreateParentChild.mockResolvedValue({
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: 'この2人の間には既に同じ親子関係が存在します',
        },
      });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'この2人の間には既に同じ親子関係が存在します'
        );
      });
      // onSuccess は呼ばれない
      expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled();
    });

    it('TC-14: 終了年 < 開始年で「次へ」をクリックするとエラーメッセージが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      // 開始年2020、終了年2010 (開始 > 終了)
      await user.type(screen.getByLabelText('開始年月 (任意)（年）'), '2020');
      await user.type(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（年）'), '2010');

      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => {
        expect(screen.getByText('終了年は開始年以降である必要があります')).toBeInTheDocument();
      });
      // 確認ステップに進まない
      expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
    });

    it('TC-15: 人物一覧取得失敗でエラートーストが表示される', async () => {
      mockGetPersonsByTree.mockResolvedValue({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'アクセス権がありません' },
      });
      render(<RelationDialog {...DEFAULT_PROPS} />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('人物一覧の取得に失敗しました');
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* UI制御                                                            */
  /* ---------------------------------------------------------------- */

  describe('UI制御', () => {
    it('TC-16: 「戻る」ボタンで前のステップに戻る', async () => {
      const { user } = await renderAndWaitForLoad();

      // ステップ1 → ステップ2
      await user.click(screen.getByRole('button', { name: /親子関係/ }));
      await waitFor(() => screen.getByText('親となる人物を選択してください。'));

      // 戻る → ステップ1に戻る
      await user.click(screen.getByRole('button', { name: '戻る' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /親子関係/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /婚姻関係/ })).toBeInTheDocument();
      });
    });

    it('TC-16b: 詳細ステップから「戻る」ボタンで人物2選択ステップに戻る', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);

      await user.click(screen.getByRole('button', { name: '戻る' }));
      await waitFor(() => {
        expect(screen.getByText('子となる人物を選択してください。')).toBeInTheDocument();
      });
    });

    it('TC-17: 「キャンセル」ボタンで onClose が呼ばれる', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(DEFAULT_PROPS.onClose).toHaveBeenCalledTimes(1);
    });

    it('TC-18: 送信中は「キャンセル」ボタンが無効化され、「作成する」は aria-disabled になる', async () => {
      // createParentChild を永続的に pending にする
      let resolveCreate!: () => void;
      mockCreateParentChild.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = () => resolve({ ok: true, data: { relationId: 'rel-x' } });
          })
      );

      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));

      await user.click(screen.getByRole('button', { name: '作成する' }));

      // 送信中にボタンが無効化されることを確認
      await waitFor(() => {
        expect(mockCreateParentChild).toHaveBeenCalledTimes(1);
      });
      // キャンセルボタンは disabled 属性で制御される
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      expect(cancelButton).toBeDisabled();
      // 「作成する」ボタンは loading 中に aria-disabled が設定される
      const submitButton = screen.getByRole('button', { name: '作成する' });
      expect(submitButton).toHaveAttribute('aria-disabled', 'true');

      // クリーンアップ
      resolveCreate();
    });

    it('TC-16c: 確認ステップから「戻る」ボタンで詳細入力ステップに戻る', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_parentChild(user);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));

      await user.click(screen.getByRole('button', { name: '戻る' }));
      await waitFor(() => {
        expect(screen.getByText(/詳細を入力/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
      });
    });
  });
});

/* ================================================================== */
/* 追加テストスイート (レビュー指摘対応)                               */
/* ================================================================== */

describe('RelationDialog — 追加テストケース', () => {
  beforeEach(() => {
    mockGetPersonsByTree.mockReset();
    mockCreateParentChild.mockReset();
    mockCreateMarriage.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    (DEFAULT_PROPS.onClose as jest.Mock).mockReset();
    (DEFAULT_PROPS.onSuccess as jest.Mock).mockReset();
  });

  /* ---------------------------------------------------------------- */
  /* 異常系: 婚姻関係の重複エラートースト表示                          */
  /* ---------------------------------------------------------------- */

  describe('婚姻関係 RELATION_CONFLICT エラー', () => {
    it('TC-ADD-01: createMarriage が RELATION_CONFLICT を返した場合、エラートーストが表示され onSuccess は呼ばれない', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: false,
        error: {
          code: 'RELATION_CONFLICT',
          message: 'この2人の間には既に同じ婚姻種別の関係が存在します',
        },
      });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'この2人の間には既に同じ婚姻種別の関係が存在します'
        );
      });
      expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 異常系: 開始年・終了年の範囲外バリデーション                      */
  /* ---------------------------------------------------------------- */

  describe('年の範囲外バリデーション', () => {
    it('TC-ADD-02a: 開始年に 999 を入力して「次へ」をクリックするとエラーメッセージが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.type(screen.getByLabelText('開始年月 (任意)（年）'), '999');
      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => {
        expect(
          screen.getByText('開始年は1000〜9999の範囲で入力してください')
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
    });

    it('TC-ADD-02b: 開始年に 10000 を入力して「次へ」をクリックするとエラーメッセージが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.type(screen.getByLabelText('開始年月 (任意)（年）'), '10000');
      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => {
        expect(
          screen.getByText('開始年は1000〜9999の範囲で入力してください')
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
    });

    it('TC-ADD-02c: 終了年に 999 を入力して「次へ」をクリックするとエラーメッセージが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.type(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（年）'), '999');
      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => {
        expect(
          screen.getByText('終了年は1000〜9999の範囲で入力してください')
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
    });

    it('TC-ADD-02d: 終了年に 10000 を入力して「次へ」をクリックするとエラーメッセージが表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.type(screen.getByLabelText('終了年月 (任意・離婚・死別の場合)（年）'), '10000');
      await user.click(screen.getByRole('button', { name: '次へ' }));

      await waitFor(() => {
        expect(
          screen.getByText('終了年は1000〜9999の範囲で入力してください')
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '作成する' })).not.toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 人物0件時の表示                                           */
  /* ---------------------------------------------------------------- */

  describe('人物リストが空の場合', () => {
    it('TC-ADD-03: getPersonsByTree が空配列を返した場合、人物選択ステップで「該当する人物が見つかりません」が表示される', async () => {
      mockGetPersonsByTree.mockResolvedValue({ ok: true, data: [] });
      const user = userEvent.setup();
      render(<RelationDialog {...DEFAULT_PROPS} />);
      await waitFor(() => expect(mockGetPersonsByTree).toHaveBeenCalledWith(DEFAULT_PROPS.treeId));

      // 親子関係ステップへ進む
      await user.click(screen.getByRole('button', { name: /親子関係/ }));

      await waitFor(() => {
        expect(screen.getByText('該当する人物が見つかりません')).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: 検索で0件になる場合                                       */
  /* ---------------------------------------------------------------- */

  describe('検索結果が0件の場合', () => {
    it('TC-ADD-04: 一致しない文字列で検索すると「該当する人物が見つかりません」が表示される', async () => {
      const { user } = await renderAndWaitForLoad();
      await user.click(screen.getByRole('button', { name: /親子関係/ }));

      await waitFor(() => screen.getByRole('listbox', { name: '親' }));

      // どの人物名にも一致しない検索文字列を入力
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, '存在しない名前XYZ');

      await waitFor(() => {
        expect(screen.getByText('該当する人物が見つかりません')).toBeInTheDocument();
      });
      // リストボックス内に人物名が表示されていないことも確認
      const listbox = screen.getByRole('listbox', { name: '親' });
      expect(within(listbox).queryByRole('option')).not.toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 異常系: createMarriage の INTERNAL_ERROR フォールバック           */
  /* ---------------------------------------------------------------- */

  describe('createMarriage INTERNAL_ERROR フォールバック', () => {
    it('TC-ADD-05: createMarriage が message なしの INTERNAL_ERROR を返した場合、フォールバック文字列でトーストが表示される', async () => {
      mockCreateMarriage.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR' },
      });
      const { user } = await renderAndWaitForLoad();
      await advanceToDetailStep_marriage(user);

      await user.click(screen.getByRole('button', { name: '次へ' }));
      await waitFor(() => screen.getByRole('button', { name: '作成する' }));
      await user.click(screen.getByRole('button', { name: '作成する' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('関係の作成に失敗しました');
      });
      expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 正常系: ダイアログ再オープン時の状態リセット                      */
  /* ---------------------------------------------------------------- */

  describe('ダイアログ再オープン時の状態リセット', () => {
    it('TC-ADD-06: 途中まで操作してダイアログを閉じて再度開くと「関係種別を選択」ステップに戻る', async () => {
      mockGetPersonsByTree.mockResolvedValue({ ok: true, data: PERSONS });
      const user = userEvent.setup();

      const { rerender } = render(<RelationDialog {...DEFAULT_PROPS} isOpen={true} />);
      await waitFor(() => expect(mockGetPersonsByTree).toHaveBeenCalledWith(DEFAULT_PROPS.treeId));

      // 親子関係を選択して1人目選択ステップへ進む
      await user.click(screen.getByRole('button', { name: /親子関係/ }));
      await waitFor(() => {
        expect(screen.getByText('親となる人物を選択してください。')).toBeInTheDocument();
      });

      // ダイアログを閉じる (isOpen=false)
      rerender(<RelationDialog {...DEFAULT_PROPS} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // 再度開く (isOpen=true)
      rerender(<RelationDialog {...DEFAULT_PROPS} isOpen={true} />);

      await waitFor(() => {
        // 「関係種別を選択」ステップに戻っていることを確認
        expect(screen.getByText(/関係種別を選択/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /親子関係/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /婚姻関係/ })).toBeInTheDocument();
      });
      // 1人目選択ステップの説明文が表示されていないことを確認
      expect(screen.queryByText('親となる人物を選択してください。')).not.toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* 異常系: getPersonsByTree の reject（例外）ハンドリング            */
  /* ---------------------------------------------------------------- */

  describe('getPersonsByTree の reject ハンドリング', () => {
    it('TC-ADD-07: getPersonsByTree が reject した場合、エラートーストが表示される', async () => {
      mockGetPersonsByTree.mockRejectedValue(new Error('Network Error'));

      render(<RelationDialog {...DEFAULT_PROPS} />);
      await waitFor(() => expect(mockGetPersonsByTree).toHaveBeenCalledWith(DEFAULT_PROPS.treeId));

      // .catch でエラートーストが表示されることを確認
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('人物一覧の取得に失敗しました');
      });
    });
  });
});
