/**
 * PhotoDetailPanel コンポーネントのテスト
 *
 * テスト観点:
 * - サムネイル表示（displayUrl による img 描画）
 * - 撮影日・キャプションの現値反映と保存（updatePhotoMeta 呼び出し）
 * - 関連人物リスト表示と紐付け解除（unlinkPersonFromPhoto 呼び出し）
 * - 未リンク人物 select から追加（linkPersonToPhoto 呼び出し）
 * - 代表写真設定（0人/1人/2人以上 の各分岐）
 * - 削除確認 UI → deletePhoto → onDeleted コールバック
 * - 閉じるボタン → onClose コールバック
 * - 各アクションのエラーメッセージ表示
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PhotoDetailPanel } from '../PhotoDetailPanel';
import type { PhotoWithLinks } from '../PhotoDetailPanel';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/photo/actions', () => ({
  linkPersonToPhoto: jest.fn(),
  unlinkPersonFromPhoto: jest.fn(),
  updatePhotoMeta: jest.fn(),
  deletePhoto: jest.fn(),
}));

jest.mock('@/features/person/actions', () => ({
  setPrimaryPhoto: jest.fn(),
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

// next/image をシンプルな img にスタブ化
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage({
    src,
    alt,
    ...rest
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) {
    // width/height/unoptimized/style は DOM の img に不要な属性なので除外
    const { width, height, unoptimized, style, ...domProps } = rest as {
      width?: number;
      height?: number;
      unoptimized?: boolean;
      style?: React.CSSProperties;
      [key: string]: unknown;
    };
    void width;
    void height;
    void unoptimized;
    void style;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...domProps} />;
  },
}));

import {
  linkPersonToPhoto,
  unlinkPersonFromPhoto,
  updatePhotoMeta,
  deletePhoto,
} from '@/features/photo/actions';
import { setPrimaryPhoto } from '@/features/person/actions';

const mockLinkPersonToPhoto = linkPersonToPhoto as jest.MockedFunction<typeof linkPersonToPhoto>;
const mockUnlinkPersonFromPhoto = unlinkPersonFromPhoto as jest.MockedFunction<
  typeof unlinkPersonFromPhoto
>;
const mockUpdatePhotoMeta = updatePhotoMeta as jest.MockedFunction<typeof updatePhotoMeta>;
const mockDeletePhoto = deletePhoto as jest.MockedFunction<typeof deletePhoto>;
const mockSetPrimaryPhoto = setPrimaryPhoto as jest.MockedFunction<typeof setPrimaryPhoto>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const PERSON_A = { id: 'person-001', displayName: '田中 太郎' };
const PERSON_B = { id: 'person-002', displayName: '田中 花子' };
const PERSON_C = { id: 'person-003', displayName: '田中 次郎' };

const BASE_PHOTO: PhotoWithLinks = {
  id: 'photo-001',
  storageObjectKey: 'photos/photo-001.jpg',
  takenYear: 2000,
  takenMonth: 6,
  takenDay: 15,
  caption: 'テストキャプション',
  personIds: [PERSON_A.id],
};

const BASE_DISPLAY_URL = 'https://example.com/photo-001.jpg';

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

function renderPanel(
  photoOverrides: Partial<PhotoWithLinks> = {},
  options: {
    persons?: Array<{ id: string; displayName: string }>;
    displayUrl?: string;
    onClose?: jest.Mock;
    onDeleted?: jest.Mock;
  } = {}
) {
  const photo = { ...BASE_PHOTO, ...photoOverrides };
  const {
    persons = [PERSON_A, PERSON_B],
    displayUrl = BASE_DISPLAY_URL,
    onClose = jest.fn(),
    onDeleted,
  } = options;

  return render(
    <PhotoDetailPanel
      treeId="tree-001"
      photo={photo}
      persons={persons}
      displayUrl={displayUrl}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('PhotoDetailPanel', () => {
  beforeEach(() => {
    mockLinkPersonToPhoto.mockReset();
    mockUnlinkPersonFromPhoto.mockReset();
    mockUpdatePhotoMeta.mockReset();
    mockDeletePhoto.mockReset();
    mockSetPrimaryPhoto.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  /* ================================================================ */
  /* レンダリング                                                       */
  /* ================================================================ */

  describe('レンダリング', () => {
    it('サムネイル img が displayUrl の src で表示される', () => {
      renderPanel();
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', BASE_DISPLAY_URL);
    });

    it('撮影年・月・日の現値が input に反映される', () => {
      renderPanel();
      expect(screen.getByLabelText('年')).toHaveValue(2000);
      expect(screen.getByLabelText('月')).toHaveValue(6);
      expect(screen.getByLabelText('日')).toHaveValue(15);
    });

    it('takenYear が null の場合、年 input の値が空になる', () => {
      renderPanel({ takenYear: null, takenMonth: null, takenDay: null });
      expect(screen.getByLabelText('年')).toHaveValue(null);
    });

    it('キャプションの現値が textarea に反映される', () => {
      renderPanel();
      expect(screen.getByLabelText('キャプション')).toHaveValue('テストキャプション');
    });

    it('caption が null の場合、textarea が空になる', () => {
      renderPanel({ caption: null });
      expect(screen.getByLabelText('キャプション')).toHaveValue('');
    });

    it('personIds に含まれる人物が関連人物リストに表示される', () => {
      // PERSON_A は personIds に含まれる
      renderPanel();
      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
    });

    it('未リンク人物が追加 select の option に表示される', () => {
      // PERSON_B は未リンク
      renderPanel();
      const select = screen.getByLabelText('追加する人物を選択');
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '田中 花子' })).toBeInTheDocument();
    });

    it('全員がリンク済みの場合、追加 select が表示されない', () => {
      renderPanel({ personIds: [PERSON_A.id, PERSON_B.id] }, { persons: [PERSON_A, PERSON_B] });
      expect(screen.queryByLabelText('追加する人物を選択')).not.toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* 撮影日・キャプション保存                                           */
  /* ================================================================ */

  describe('撮影日・キャプション保存', () => {
    it('撮影日を変更して保存ボタンを押すと updatePhotoMeta が正しい引数で呼ばれる', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      // 年を変更
      fireEvent.change(screen.getByLabelText('年'), { target: { value: '1990' } });
      // 月を変更
      fireEvent.change(screen.getByLabelText('月'), { target: { value: '3' } });
      // 日を変更
      fireEvent.change(screen.getByLabelText('日'), { target: { value: '20' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(mockUpdatePhotoMeta).toHaveBeenCalledWith({
          photoId: 'photo-001',
          takenYear: 1990,
          takenMonth: 3,
          takenDay: 20,
          caption: 'テストキャプション',
        });
      });
    });

    it('キャプションを変更して保存すると updatePhotoMeta が呼ばれる', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.change(screen.getByLabelText('キャプション'), {
        target: { value: '新しいキャプション' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(mockUpdatePhotoMeta).toHaveBeenCalledWith(
          expect.objectContaining({ caption: '新しいキャプション' })
        );
      });
    });

    it('キャプションを空にして保存すると caption が null で updatePhotoMeta が呼ばれる', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.change(screen.getByLabelText('キャプション'), { target: { value: '' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(mockUpdatePhotoMeta).toHaveBeenCalledWith(
          expect.objectContaining({ caption: null })
        );
      });
    });

    it('updatePhotoMeta 成功 → toast.success が呼ばれる', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('写真情報を保存しました');
      });
    });

    it('updatePhotoMeta 失敗 → エラーメッセージが表示される', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '保存に失敗しました' },
      });
      renderPanel();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('保存に失敗しました');
      });
    });

    it('updatePhotoMeta 失敗 → toast.success は呼ばれない', async () => {
      mockUpdatePhotoMeta.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '保存に失敗しました' },
      });
      renderPanel();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /* 関連人物                                                           */
  /* ================================================================ */

  describe('関連人物', () => {
    it('削除ボタンをクリックすると unlinkPersonFromPhoto が正しい引数で呼ばれる', async () => {
      mockUnlinkPersonFromPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `${PERSON_A.displayName} の紐付けを解除` })
        );
      });

      await waitFor(() => {
        expect(mockUnlinkPersonFromPhoto).toHaveBeenCalledWith({
          photoId: 'photo-001',
          personId: PERSON_A.id,
        });
      });
    });

    it('unlinkPersonFromPhoto 成功 → toast.success が呼ばれる', async () => {
      mockUnlinkPersonFromPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `${PERSON_A.displayName} の紐付けを解除` })
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物の紐付けを解除しました');
      });
    });

    it('未リンク人物を select で選択して追加ボタンを押すと linkPersonToPhoto が呼ばれる', async () => {
      mockLinkPersonToPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      // PERSON_B を選択
      fireEvent.change(screen.getByLabelText('追加する人物を選択'), {
        target: { value: PERSON_B.id },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '追加' }));
      });

      await waitFor(() => {
        expect(mockLinkPersonToPhoto).toHaveBeenCalledWith({
          photoId: 'photo-001',
          personId: PERSON_B.id,
          treeId: 'tree-001',
        });
      });
    });

    it('linkPersonToPhoto 成功 → toast.success が呼ばれる', async () => {
      mockLinkPersonToPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.change(screen.getByLabelText('追加する人物を選択'), {
        target: { value: PERSON_B.id },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '追加' }));
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('人物を紐付けました');
      });
    });

    it('linkPersonToPhoto 失敗 → エラーメッセージが表示される', async () => {
      mockLinkPersonToPhoto.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '紐付けに失敗しました' },
      });
      renderPanel();

      fireEvent.change(screen.getByLabelText('追加する人物を選択'), {
        target: { value: PERSON_B.id },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '追加' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('紐付けに失敗しました');
      });
    });

    it('人物が選択されていない場合、追加ボタンが disabled', () => {
      renderPanel();
      // select が初期値 '' のため追加ボタンは disabled
      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    });
  });

  /* ================================================================ */
  /* 代表写真設定                                                       */
  /* ================================================================ */

  describe('代表写真設定', () => {
    it('紐付き人物が0人の場合、代表写真ボタンが表示されない', () => {
      renderPanel({ personIds: [] }, { persons: [PERSON_A, PERSON_B] });
      expect(
        screen.queryByRole('button', { name: /の代表写真に設定/ })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '代表写真に設定' })
      ).not.toBeInTheDocument();
    });

    it('紐付き人物が0人の場合、案内メッセージが表示される', () => {
      renderPanel({ personIds: [] }, { persons: [PERSON_A, PERSON_B] });
      expect(
        screen.getByText('人物を紐付けると代表写真として設定できます')
      ).toBeInTheDocument();
    });

    it('紐付き人物が1人の場合、1クリックで setPrimaryPhoto が呼ばれる', async () => {
      mockSetPrimaryPhoto.mockResolvedValue({ ok: true, data: undefined });
      // PERSON_A のみリンク済み
      renderPanel({ personIds: [PERSON_A.id] }, { persons: [PERSON_A, PERSON_B] });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `${PERSON_A.displayName} の代表写真に設定` })
        );
      });

      await waitFor(() => {
        expect(mockSetPrimaryPhoto).toHaveBeenCalledWith({
          personId: PERSON_A.id,
          photoId: 'photo-001',
        });
      });
    });

    it('setPrimaryPhoto 成功 → toast.success が呼ばれる', async () => {
      mockSetPrimaryPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel({ personIds: [PERSON_A.id] }, { persons: [PERSON_A, PERSON_B] });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `${PERSON_A.displayName} の代表写真に設定` })
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('代表写真を設定しました');
      });
    });

    it('紐付き人物が2人以上の場合、代表写真用 select が表示される', () => {
      renderPanel(
        { personIds: [PERSON_A.id, PERSON_B.id] },
        { persons: [PERSON_A, PERSON_B] }
      );
      expect(screen.getByLabelText('代表写真として設定する人物を選択')).toBeInTheDocument();
    });

    it('紐付き人物が2人以上の場合、select で選択してボタンを押すと setPrimaryPhoto が呼ばれる', async () => {
      mockSetPrimaryPhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel(
        { personIds: [PERSON_A.id, PERSON_B.id] },
        { persons: [PERSON_A, PERSON_B] }
      );

      // PERSON_B を選択
      fireEvent.change(screen.getByLabelText('代表写真として設定する人物を選択'), {
        target: { value: PERSON_B.id },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '代表写真に設定' }));
      });

      await waitFor(() => {
        expect(mockSetPrimaryPhoto).toHaveBeenCalledWith({
          personId: PERSON_B.id,
          photoId: 'photo-001',
        });
      });
    });

    it('紐付き人物が2人以上で人物未選択の場合、代表写真ボタンが disabled', () => {
      renderPanel(
        { personIds: [PERSON_A.id, PERSON_B.id] },
        { persons: [PERSON_A, PERSON_B] }
      );
      // select 初期値が '' のため disabled
      expect(screen.getByRole('button', { name: '代表写真に設定' })).toBeDisabled();
    });

    it('setPrimaryPhoto 失敗 → エラーメッセージが表示される', async () => {
      mockSetPrimaryPhoto.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '代表写真の設定に失敗しました' },
      });
      renderPanel({ personIds: [PERSON_A.id] }, { persons: [PERSON_A, PERSON_B] });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `${PERSON_A.displayName} の代表写真に設定` })
        );
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('代表写真の設定に失敗しました');
      });
    });
  });

  /* ================================================================ */
  /* 削除                                                               */
  /* ================================================================ */

  describe('削除', () => {
    it('初期状態では削除確認UI（alertdialog）が表示されない', () => {
      renderPanel();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('「この写真を削除」ボタンをクリックすると削除確認UIが表示される', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('削除確認UIの「キャンセル」ボタンで確認UIが閉じる', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('「削除する」ボタンクリックで deletePhoto が正しい引数で呼ばれる', async () => {
      mockDeletePhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(mockDeletePhoto).toHaveBeenCalledWith({ photoId: 'photo-001' });
      });
    });

    it('deletePhoto 成功 → toast.success が呼ばれる', async () => {
      mockDeletePhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('写真を削除しました');
      });
    });

    it('deletePhoto 成功 → onDeleted コールバックが呼ばれる', async () => {
      mockDeletePhoto.mockResolvedValue({ ok: true, data: undefined });
      const onDeleted = jest.fn();
      renderPanel({}, { onDeleted });

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalled();
      });
    });

    it('deletePhoto 成功 → 削除確認UIが閉じる', async () => {
      mockDeletePhoto.mockResolvedValue({ ok: true, data: undefined });
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('deletePhoto 失敗 → toast.error が呼ばれる', async () => {
      mockDeletePhoto.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('削除に失敗しました');
      });
    });

    it('deletePhoto 失敗 → onDeleted は呼ばれない', async () => {
      mockDeletePhoto.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      const onDeleted = jest.fn();
      renderPanel({}, { onDeleted });

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('deletePhoto 失敗 → 削除確認UIが閉じる', async () => {
      mockDeletePhoto.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '削除に失敗しました' },
      });
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('onDeleted が未定義でも deletePhoto 成功時にクラッシュしない', async () => {
      mockDeletePhoto.mockResolvedValue({ ok: true, data: undefined });
      // onDeleted を渡さない
      renderPanel({}, {});

      fireEvent.click(screen.getByRole('button', { name: 'この写真を削除' }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('写真を削除しました');
      });
    });
  });

  /* ================================================================ */
  /* 閉じる                                                             */
  /* ================================================================ */

  describe('閉じる', () => {
    it('閉じるボタンをクリックすると onClose が呼ばれる', () => {
      const onClose = jest.fn();
      renderPanel({}, { onClose });
      fireEvent.click(screen.getByRole('button', { name: 'パネルを閉じる' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
