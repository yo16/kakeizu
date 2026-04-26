'use client';

import React, { useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import { registerPhotoAfterUpload } from '@/features/photo/actions';

import { compressImage } from '../utils/compressImage';
import { uploadPhoto } from '../utils/uploadPhoto';
import styles from './PhotoUploader.module.css';

const MAX_BLOB_SIZE = 5 * 1024 * 1024; // 5MB

type Status = 'idle' | 'compressing' | 'signing' | 'uploading' | 'registering' | 'done' | 'error';

const STATUS_MESSAGES: Record<Exclude<Status, 'idle' | 'done' | 'error'>, string> = {
  compressing: '画像を圧縮しています...',
  signing: 'アップロード準備中...',
  uploading: 'アップロード中...',
  registering: '写真を登録中...',
};

export interface PhotoUploaderProps {
  treeId: string;
  personIds?: string[];
  onUploaded: (photoId: string) => void;
  onError?: (message: string) => void;
}

export function PhotoUploader({ treeId, personIds, onUploaded, onError }: PhotoUploaderProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleError = (message: string) => {
    setStatus('error');
    setErrorMessage(message);
    onError?.(message);
    toast.error(message);
  };

  const processFile = async (file: File) => {
    setStatus('compressing');
    setErrorMessage(null);

    // 圧縮
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (err) {
      handleError(err instanceof Error ? err.message : '画像の圧縮に失敗しました');
      return;
    }

    // サイズチェック
    if (blob.size > MAX_BLOB_SIZE) {
      handleError('圧縮後も 5MB を超えています。別の画像を選択してください');
      return;
    }

    // 署名付きURL取得
    setStatus('signing');
    let uploadUrl: string;
    let objectKey: string;
    try {
      const response = await fetch('/api/storage/signed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          treeId,
          fileName: file.name,
          contentType: 'image/jpeg',
          byteSize: blob.size,
        }),
      });

      const data = await response.json() as
        | { ok: true; data: { uploadUrl: string; objectKey: string } }
        | { ok: false; error: { message: string } };

      if (!response.ok || !data.ok) {
        const message = !data.ok ? data.error.message : 'アップロードURLの取得に失敗しました';
        handleError(message);
        return;
      }

      uploadUrl = data.data.uploadUrl;
      objectKey = data.data.objectKey;
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'アップロードURLの取得に失敗しました');
      return;
    }

    // アップロード
    setStatus('uploading');
    try {
      await uploadPhoto(uploadUrl, blob, objectKey);
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      return;
    }

    // DB登録
    setStatus('registering');
    const result = await registerPhotoAfterUpload({
      treeId,
      storageObjectKey: objectKey,
      mimeType: 'image/jpeg',
      byteSize: blob.size,
      personIds,
    });

    if (!result.ok) {
      handleError(result.error.message);
      return;
    }

    toast.success('写真を追加しました');
    setStatus('idle');
    onUploaded(result.data.photoId);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // inputをリセットして同じファイルを再選択できるようにする
    e.target.value = '';
    void processFile(file);
  };

  const handleClick = () => {
    if (status !== 'idle' && status !== 'error') return;
    inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (status !== 'idle' && status !== 'error') return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void processFile(file);
  };

  const handleCloseError = () => {
    setStatus('idle');
    setErrorMessage(null);
  };

  const isProcessing = status !== 'idle' && status !== 'error';

  return (
    <div className={styles.wrapper}>
      <div
        role="button"
        tabIndex={0}
        className={`${styles.dropzone}${isDragOver ? ` ${styles.dropzoneActive}` : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="写真をアップロード（クリックまたはドラッグ&ドロップ）"
        aria-disabled={isProcessing}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={styles.input}
          onChange={handleFileChange}
          tabIndex={-1}
          aria-hidden="true"
        />

        {status === 'idle' && (
          <div className={styles.idleContent}>
            <span className={styles.icon} aria-hidden="true">+</span>
            <span className={styles.label}>写真を追加</span>
            <span className={styles.hint}>クリックまたはドラッグ&ドロップ</span>
          </div>
        )}

        {isProcessing && (
          <div className={styles.status} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <span>{STATUS_MESSAGES[status as keyof typeof STATUS_MESSAGES]}</span>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.idleContent}>
            <span className={styles.icon} aria-hidden="true">+</span>
            <span className={styles.label}>再試行する</span>
            <span className={styles.hint}>クリックまたはドラッグ&ドロップ</span>
          </div>
        )}
      </div>

      {status === 'error' && errorMessage && (
        <div className={styles.error} role="alert">
          <span className={styles.errorMessage}>{errorMessage}</span>
          <button
            type="button"
            className={styles.closeError}
            onClick={handleCloseError}
            aria-label="エラーを閉じる"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
