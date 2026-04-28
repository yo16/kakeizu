/**
 * 利用規約ページのテスト
 *
 * テスト観点:
 * - h1 タイトルの表示
 * - 最終更新日の表示
 * - 草案バナー (draft 表記) の表示
 * - 第1〜9条のセクション見出しの存在
 * - 第4条で家系図情報の取扱いに関する記述
 * - 第7条で退会時のデータ削除記述
 */

import { render, screen } from '@testing-library/react';
import TermsPage from '../page';

describe('利用規約ページ', () => {
  // ---------------------------------------------------------------------------
  // ページタイトル・基本情報
  // ---------------------------------------------------------------------------
  describe('ページタイトル・基本情報', () => {
    it('「利用規約」が h1 で表示されること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { level: 1, name: '利用規約' })).toBeInTheDocument();
    });

    it('「最終更新日」が表示されること', () => {
      render(<TermsPage />);

      expect(screen.getByText(/最終更新日/)).toBeInTheDocument();
    });

    it('草案バナー (Draft) が表示されること', () => {
      render(<TermsPage />);

      expect(screen.getByText(/草案.*Draft|Draft.*草案/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 各条のセクション見出し
  // ---------------------------------------------------------------------------
  describe('セクション見出し', () => {
    it('第1条（適用）の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第1条/ })).toBeInTheDocument();
    });

    it('第2条（アカウント）の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第2条/ })).toBeInTheDocument();
    });

    it('第3条（禁止事項）の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第3条/ })).toBeInTheDocument();
    });

    it('第4条（家系図情報の取扱い）の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第4条/ })).toBeInTheDocument();
    });

    it('第5条の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第5条/ })).toBeInTheDocument();
    });

    it('第6条の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第6条/ })).toBeInTheDocument();
    });

    it('第7条（退会）の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第7条/ })).toBeInTheDocument();
    });

    it('第8条の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第8条/ })).toBeInTheDocument();
    });

    it('第9条の見出しが存在すること', () => {
      render(<TermsPage />);

      expect(screen.getByRole('heading', { name: /第9条/ })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // コンテンツ内容
  // ---------------------------------------------------------------------------
  describe('コンテンツ内容', () => {
    it('第4条で家系図情報（ユーザーコンテンツ）の取扱いに関する記述があること', () => {
      render(<TermsPage />);

      expect(screen.getByText(/家族情報・写真等のコンテンツ/)).toBeInTheDocument();
    });

    it('第7条で退会時のデータ削除に関する記述があること', () => {
      render(<TermsPage />);

      expect(screen.getByText(/アカウントを削除した場合/)).toBeInTheDocument();
    });

    it('第7条でデータの復元不可の警告があること', () => {
      render(<TermsPage />);

      expect(screen.getByText(/削除されたデータは復元できません/)).toBeInTheDocument();
    });
  });
});
