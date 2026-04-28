'use client';

/**
 * ShareLinkPanel — 共有URL管理パネル (Client Component)
 *
 * - 共有リンクが未発行の場合: 説明文 + 「共有URLを発行する」ボタン
 * - 共有リンクが発行済みの場合: URL表示 + コピーボタン + 作成日 + 無効化ボタン
 *
 * props:
 *   treeId       — 対象ツリーID
 *   initialLink  — Server Component から渡す初期リンク情報 (null = 未発行)
 */

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui';

import { createShareLink } from '../actions/createShareLink';
import { revokeShareLink } from '../actions/revokeShareLink';
import type { ShareLink } from '../actions/createShareLink';

import styles from './ShareLinkPanel.module.css';

interface ShareLinkPanelProps {
  treeId: string;
  initialLink: ShareLink | null;
}

export function ShareLinkPanel({ treeId, initialLink }: ShareLinkPanelProps) {
  const [link, setLink] = useState<ShareLink | null>(initialLink);
  const [isCreating, setIsCreating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [copySuccessVisible, setCopySuccessVisible] = useState(false);

  /** 共有URLを構築する */
  const buildShareUrl = useCallback((token: string): string => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/share/${token}`;
  }, []);

  /** 共有URLを発行する */
  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);

    const result = await createShareLink({ treeId });

    if (result.ok) {
      setLink(result.data);
    } else {
      setCreateError(result.error.message);
    }

    setIsCreating(false);
  };

  /** URLをクリップボードにコピーする */
  const handleCopy = async () => {
    if (!link) return;

    const url = buildShareUrl(link.token);

    try {
      // navigator.clipboard API (モダンブラウザ)
      await navigator.clipboard.writeText(url);
    } catch {
      // フォールバック: textarea + execCommand
      try {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // コピー失敗の場合は何もしない (ユーザーが手動でコピー可能)
        return;
      }
    }

    // コピー成功メッセージを 2 秒表示
    setCopySuccessVisible(true);
    setTimeout(() => setCopySuccessVisible(false), 2000);
  };

  /** 共有URLを無効化する */
  const handleRevoke = async () => {
    if (!link) return;

    const confirmed = window.confirm(
      '共有URLを無効化しますか？\n\n無効化すると、現在のURLにアクセスしている人も家系図を閲覧できなくなります。'
    );
    if (!confirmed) return;

    setIsRevoking(true);
    setRevokeError(null);

    const result = await revokeShareLink({ linkId: link.id });

    if (result.ok) {
      setLink(null);
    } else {
      setRevokeError(result.error.message);
    }

    setIsRevoking(false);
  };

  // --- リンク未発行状態 ---
  if (link === null) {
    return (
      <div>
        <p className={styles.description}>
          共有URLを発行すると、家族など限られた人が認証なしで家系図を閲覧できます。
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={isCreating}
          loading={isCreating}
          onClick={handleCreate}
        >
          共有URLを発行する
        </Button>
        {createError && (
          <p className={styles.error} role="alert">
            {createError}
          </p>
        )}
      </div>
    );
  }

  // --- リンク発行済み状態 ---
  const shareUrl = buildShareUrl(link.token);
  const createdAtFormatted = new Date(link.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.linkCard}>
      {/* URL 表示 + コピー */}
      <div className={styles.urlRow}>
        <input
          className={styles.urlInput}
          type="text"
          readOnly
          value={shareUrl}
          aria-label="共有URL"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          aria-label="共有URLをコピー"
        >
          コピー
        </Button>
      </div>

      {/* コピー成功メッセージ */}
      {copySuccessVisible && (
        <p className={styles.copySuccess} role="status" aria-live="polite">
          ✓ コピーしました
        </p>
      )}

      {/* 作成日 + バッジ */}
      <div className={styles.metaRow}>
        <span className={styles.metaDate}>作成日: {createdAtFormatted}</span>
        <span className={styles.badge}>現在有効</span>
      </div>

      {/* 無効化 */}
      <div className={styles.revokeRow}>
        {revokeError && (
          <p className={styles.revokeError} role="alert">
            {revokeError}
          </p>
        )}
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={isRevoking}
          loading={isRevoking}
          onClick={handleRevoke}
        >
          無効化する
        </Button>
      </div>
    </div>
  );
}
