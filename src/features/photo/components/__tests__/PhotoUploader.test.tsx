/**
 * PhotoUploader コンポーネントのテスト
 *
 * テスト観点:
 * - ファイル選択(input change) → compressImage → fetch(signed-upload) → uploadPhoto → registerPhotoAfterUpload → onUploaded の正常フロー
 * - fetch に渡される payload の正確性
 * - registerPhotoAfterUpload に渡される引数の正確性（personIds を含む）
 * - ドラッグ&ドロップによるファイル受け取り
 * - compressImage が throw した場合のエラー表示と onError 呼び出し
 * - 圧縮後サイズが 5MB 超の場合のクライアント側ガード
 * - signed-upload の response.ok が false の場合のエラー表示
 * - signed-upload レスポンスが { ok: false, error: { message } } の場合のエラーメッセージ内容
 * - uploadPhoto が throw した場合のエラー表示
 * - registerPhotoAfterUpload が { ok: false } の場合のエラー表示
 * - input の accept 属性の確認
 * - エラー後にファイルを再選択してフローが再実行されること
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoUploader } from '../PhotoUploader';

/* ------------------------------------------------------------------ */
/* モック設定                                                           */
/* ------------------------------------------------------------------ */

jest.mock('@/features/photo/utils/compressImage', () => ({
  compressImage: jest.fn(),
}));

jest.mock('@/features/photo/utils/uploadPhoto', () => ({
  uploadPhoto: jest.fn(),
}));

jest.mock('@/features/photo/actions', () => ({
  registerPhotoAfterUpload: jest.fn(),
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

import { compressImage } from '@/features/photo/utils/compressImage';
import { uploadPhoto } from '@/features/photo/utils/uploadPhoto';
import { registerPhotoAfterUpload } from '@/features/photo/actions';

const mockCompressImage = compressImage as jest.MockedFunction<typeof compressImage>;
const mockUploadPhoto = uploadPhoto as jest.MockedFunction<typeof uploadPhoto>;
const mockRegisterPhotoAfterUpload = registerPhotoAfterUpload as jest.MockedFunction<
  typeof registerPhotoAfterUpload
>;

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                         */
/* ------------------------------------------------------------------ */

const TREE_ID = 'tree-001';
const PERSON_IDS = ['person-001', 'person-002'];
const UPLOAD_URL = 'https://storage.example.com/signed-upload';
const OBJECT_KEY = 'u/tree-001/photo.jpg';
const PHOTO_ID = 'photo-uuid';

const DUMMY_BLOB = new Blob(['dummy'], { type: 'image/jpeg' });
const LARGE_BLOB = new Blob([new ArrayBuffer(6 * 1024 * 1024)], { type: 'image/jpeg' });

function makeFile(name = 'test.jpg', content: BlobPart = 'content'): File {
  return new File([content], name, { type: 'image/jpeg' });
}

/* ------------------------------------------------------------------ */
/* ヘルパー                                                             */
/* ------------------------------------------------------------------ */

function renderUploader(
  options: {
    treeId?: string;
    personIds?: string[];
    onUploaded?: jest.Mock;
    onError?: jest.Mock;
  } = {}
) {
  const {
    treeId = TREE_ID,
    personIds = PERSON_IDS,
    onUploaded = jest.fn(),
    onError = jest.fn(),
  } = options;

  return render(
    <PhotoUploader
      treeId={treeId}
      personIds={personIds}
      onUploaded={onUploaded}
      onError={onError}
    />
  );
}

function getInput(): HTMLInputElement {
  // input は aria-hidden のため getAllByRole は使えない。type 属性で直接取得する
  // eslint-disable-next-line testing-library/no-node-access
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function getDropzone(): HTMLElement {
  return screen.getByRole('button', { name: /写真をアップロード/ });
}

function makeSuccessfulFetchMock(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      data: { uploadUrl: UPLOAD_URL, objectKey: OBJECT_KEY },
    }),
  });
}

/* ------------------------------------------------------------------ */
/* テスト                                                               */
/* ------------------------------------------------------------------ */

describe('PhotoUploader', () => {
  beforeEach(() => {
    mockCompressImage.mockReset();
    mockUploadPhoto.mockReset();
    mockRegisterPhotoAfterUpload.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();

    // デフォルト成功モック
    mockCompressImage.mockResolvedValue(DUMMY_BLOB);
    global.fetch = makeSuccessfulFetchMock();
    mockUploadPhoto.mockResolvedValue(OBJECT_KEY);
    mockRegisterPhotoAfterUpload.mockResolvedValue({
      ok: true,
      data: { photoId: PHOTO_ID },
    });
  });

  /* ================================================================ */
  /* 正常フロー                                                         */
  /* ================================================================ */

  describe('正常フロー', () => {
    it('ファイル選択 → 各関数が順に呼ばれ、最後に onUploaded(photoId) が呼ばれる', async () => {
      const onUploaded = jest.fn();
      renderUploader({ onUploaded });

      const file = makeFile();
      fireEvent.change(getInput(), { target: { files: [file] } });

      await waitFor(() => {
        expect(mockCompressImage).toHaveBeenCalledWith(file);
      });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockUploadPhoto).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockRegisterPhotoAfterUpload).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(onUploaded).toHaveBeenCalledWith(PHOTO_ID);
      });
    });

    it('fetch に正しい payload が渡される', async () => {
      renderUploader({ treeId: TREE_ID });
      const file = makeFile('photo.jpg');

      fireEvent.change(getInput(), { target: { files: [file] } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/storage/signed-upload',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              treeId: TREE_ID,
              fileName: 'photo.jpg',
              contentType: 'image/jpeg',
              byteSize: DUMMY_BLOB.size,
            }),
          })
        );
      });
    });

    it('registerPhotoAfterUpload に正しい引数が渡される（personIds を含む）', async () => {
      renderUploader({ treeId: TREE_ID, personIds: PERSON_IDS });
      const file = makeFile();

      fireEvent.change(getInput(), { target: { files: [file] } });

      await waitFor(() => {
        expect(mockRegisterPhotoAfterUpload).toHaveBeenCalledWith({
          treeId: TREE_ID,
          storageObjectKey: OBJECT_KEY,
          mimeType: 'image/jpeg',
          byteSize: DUMMY_BLOB.size,
          personIds: PERSON_IDS,
        });
      });
    });

    it('完了後に toast.success が呼ばれる', async () => {
      renderUploader();
      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalled();
      });
    });

    it('完了後にエラーメッセージは表示されない', async () => {
      renderUploader();
      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalled();
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  /* ================================================================ */
  /* ドラッグ&ドロップ                                                  */
  /* ================================================================ */

  describe('ドラッグ&ドロップ', () => {
    it('drop イベントでフローが開始され onUploaded が呼ばれる', async () => {
      const onUploaded = jest.fn();
      renderUploader({ onUploaded });

      const file = makeFile();
      const dropzone = getDropzone();

      fireEvent.drop(dropzone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(mockCompressImage).toHaveBeenCalledWith(file);
      });
      await waitFor(() => {
        expect(onUploaded).toHaveBeenCalledWith(PHOTO_ID);
      });
    });

    it('drop 後に fetch が呼ばれる', async () => {
      renderUploader();
      const dropzone = getDropzone();

      fireEvent.drop(dropzone, {
        dataTransfer: { files: [makeFile()] },
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  /* ================================================================ */
  /* エラー系                                                           */
  /* ================================================================ */

  describe('エラー系', () => {
    it('compressImage が throw → role="alert" が表示される', async () => {
      mockCompressImage.mockRejectedValue(new Error('圧縮エラー'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('compressImage が throw → エラーメッセージに例外のメッセージが含まれる', async () => {
      mockCompressImage.mockRejectedValue(new Error('圧縮エラー'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('圧縮エラー');
      });
    });

    it('compressImage が throw → onError が呼ばれる', async () => {
      mockCompressImage.mockRejectedValue(new Error('圧縮エラー'));
      const onError = jest.fn();
      renderUploader({ onError });

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('圧縮エラー');
      });
    });

    it('圧縮後サイズが 5MB 超 → エラー表示される', async () => {
      mockCompressImage.mockResolvedValue(LARGE_BLOB);
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('圧縮後サイズが 5MB 超 → fetch は呼ばれない', async () => {
      mockCompressImage.mockResolvedValue(LARGE_BLOB);
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('signed-upload の response.ok が false → エラー表示される', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ ok: true, data: { uploadUrl: UPLOAD_URL, objectKey: OBJECT_KEY } }),
      });
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('signed-upload レスポンスが { ok: false, error: { message: "xxx" } } → エラーメッセージに "xxx" が含まれる', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: false,
          error: { message: 'サーバーエラーが発生しました' },
        }),
      });
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('サーバーエラーが発生しました');
      });
    });

    it('uploadPhoto が throw → エラー表示される', async () => {
      mockUploadPhoto.mockRejectedValue(new Error('ネットワークエラー'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('uploadPhoto が throw → エラーメッセージに例外のメッセージが含まれる', async () => {
      mockUploadPhoto.mockRejectedValue(new Error('ネットワークエラー'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('ネットワークエラー');
      });
    });

    it('registerPhotoAfterUpload が { ok: false, error: { message: "yyy" } } → エラー表示される', async () => {
      mockRegisterPhotoAfterUpload.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB登録に失敗しました' },
      });
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('DB登録に失敗しました');
      });
    });

    it('registerPhotoAfterUpload が { ok: false } → onError が呼ばれる', async () => {
      mockRegisterPhotoAfterUpload.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB登録に失敗しました' },
      });
      const onError = jest.fn();
      renderUploader({ onError });

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('DB登録に失敗しました');
      });
    });

    it('各エラー発生時に toast.error が呼ばれる', async () => {
      mockCompressImage.mockRejectedValue(new Error('圧縮エラー'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });
  });

  /* ================================================================ */
  /* UI / 属性                                                          */
  /* ================================================================ */

  describe('UI / 属性', () => {
    it('input[type="file"] の accept 属性が "image/jpeg,image/png,image/webp"', () => {
      renderUploader();
      const input = getInput();
      expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    });

    it('初期状態で「写真を追加」テキストが表示される', () => {
      renderUploader();
      expect(screen.getByText('写真を追加')).toBeInTheDocument();
    });

    it('エラー状態で「再試行する」テキストが表示される', async () => {
      mockCompressImage.mockRejectedValue(new Error('失敗'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByText('再試行する')).toBeInTheDocument();
      });
    });

    it('エラー後に「閉じる」ボタンで alert が消え、idle 状態に戻る', async () => {
      mockCompressImage.mockRejectedValue(new Error('失敗'));
      renderUploader();

      fireEvent.change(getInput(), { target: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'エラーを閉じる' }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('写真を追加')).toBeInTheDocument();
    });

    it('エラー後にファイルを再選択するとフローが再実行される', async () => {
      mockCompressImage.mockRejectedValueOnce(new Error('一回目は失敗'));
      renderUploader();

      // 1回目: エラー
      fireEvent.change(getInput(), { target: { files: [makeFile('first.jpg')] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // 2回目用に成功モックに戻す
      mockCompressImage.mockResolvedValue(DUMMY_BLOB);

      // 2回目: 再選択 → 成功
      const onUploaded = jest.fn();
      // onUploaded を個別に差し替えるために再レンダリングではなく、
      // 別途 renderUploader でラップするのではなく、
      // 最初から onUploaded を渡してエラー後の再試行を確認する
      // ここでは compressImage が2回目に成功することを確認する
      fireEvent.change(getInput(), { target: { files: [makeFile('second.jpg')] } });

      await waitFor(() => {
        expect(mockCompressImage).toHaveBeenCalledTimes(2);
      });

      // 2回目の呼び出しは成功モックなので fetch まで到達する
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('ドロップゾーンに aria-disabled 属性が存在する', () => {
      renderUploader();
      const dropzone = getDropzone();
      // idle 状態では aria-disabled="false"
      expect(dropzone).toHaveAttribute('aria-disabled', 'false');
    });
  });
});
