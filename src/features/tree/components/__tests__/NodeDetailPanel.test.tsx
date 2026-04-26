/**
 * NodeDetailPanel コンポーネントのテスト
 *
 * - 表示/非表示の切り替え
 * - 人物ノード選択時のコンテンツ
 * - 婚姻ノード選択時のコンテンツ
 * - オーバーレイ・閉じるボタンによる閉じる動作
 * - アクセシビリティ属性
 * - CSS Modules クラス確認
 *
 * NodeDetailPanel は createPortal で document.body にマウントされるため、
 * EditPersonDrawer など内部の複雑なコンポーネントをモックする。
 */

// EditPersonDrawer のモック（createPortal / Supabase 依存を排除）
jest.mock('@/features/person/components/EditPersonDrawer', () => ({
  EditPersonDrawer: () => null,
}));

// formatPartialDate のモック（シンプルな実装で検証しやすくする）
jest.mock('@/lib/date/partial-date', () => ({
  formatPartialDate: ({ year, month, day }: { year: number | null; month?: number | null; day?: number | null }) => {
    if (year == null) return '';
    const parts = [String(year)];
    if (month != null) parts.push(String(month).padStart(2, '0'));
    if (day != null) parts.push(String(day).padStart(2, '0'));
    return parts.join('/');
  },
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeDetailPanel } from '../NodeDetailPanel';
import type { NodeDetailPanelProps } from '../NodeDetailPanel';
import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

// ─── テストデータ ──────────────────────────────────────────────────────────────

const BASE_PERSON: Person = {
  id: 'person-001',
  treeId: 'tree-001',
  displayName: '田中 太郎',
  familyName: '田中',
  givenName: '太郎',
  maidenName: null,
  gender: 'male',
  birthYear: 1950,
  birthMonth: 4,
  birthDay: 1,
  birthPlace: '東京都',
  deathYear: null,
  deathMonth: null,
  deathDay: null,
  deathPlace: null,
  isAlive: true,
  note: 'テストメモ',
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const PERSON_SPOUSE: Person = {
  id: 'person-002',
  treeId: 'tree-001',
  displayName: '田中 花子',
  familyName: '田中',
  givenName: '花子',
  maidenName: null,
  gender: 'female',
  birthYear: 1955,
  birthMonth: null,
  birthDay: null,
  birthPlace: null,
  deathYear: null,
  deathMonth: null,
  deathDay: null,
  deathPlace: null,
  isAlive: true,
  note: null,
  primaryPhotoId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const BASE_RELATION: RelationRow = {
  id: 'relation-001',
  treeId: 'tree-001',
  kind: 'marriage',
  fromPersonId: 'person-001',
  toPersonId: 'person-002',
  parentRole: null,
  marriageType: 'legal',
  marriageStatus: 'current',
  startYear: 1975,
  startMonth: null,
  endYear: null,
  endMonth: null,
  note: null,
  createdAt: '2024-01-01T00:00:00Z',
};

const EMPTY_PHOTOS: PhotoSummary[] = [];

/** デフォルト props（パネル閉じ状態） */
function makeProps(overrides: Partial<NodeDetailPanelProps> = {}): NodeDetailPanelProps {
  return {
    selectedNode: null,
    onClose: jest.fn(),
    persons: [BASE_PERSON, PERSON_SPOUSE],
    photos: EMPTY_PHOTOS,
    relations: [BASE_RELATION],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('NodeDetailPanel', () => {
  // -------------------------------------------------------------------------
  // 1. selectedNode=null のとき非表示
  // -------------------------------------------------------------------------
  describe('selectedNode=null のとき', () => {
    it('パネルが非表示状態であること (panelOpen クラスなし)', () => {
      render(<NodeDetailPanel {...makeProps()} />);

      const panel = document.querySelector('[role="dialog"]');
      expect(panel).toBeInTheDocument();
      // CSS Modules 変換後のクラス名に "panelOpen" が含まれないこと
      expect(panel?.className ?? '').not.toContain('panelOpen');
    });

    it('aria-hidden=true が設定されていること', () => {
      render(<NodeDetailPanel {...makeProps()} />);

      const panel = document.querySelector('[role="dialog"]');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // -------------------------------------------------------------------------
  // 2. 人物ノード選択時に氏名・生没年・メモが表示される
  // -------------------------------------------------------------------------
  describe('人物ノード選択時のコンテンツ', () => {
    it('displayName が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      // displayName は displayName クラスの span に表示される（複数要素が存在する可能性あり）
      const allByText = screen.getAllByText('田中 太郎');
      expect(allByText.length).toBeGreaterThan(0);
    });

    it('familyName/givenName が subName クラスで表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      // familyName + givenName が subName クラスの span として表示される
      const subName = document.querySelector('.subName');
      expect(subName).toBeInTheDocument();
      expect(subName?.textContent).toBe('田中 太郎');
    });

    it('生年月日が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      // formatPartialDate モック: 1950/04/01 形式で返る
      expect(screen.getByText('1950/04/01')).toBeInTheDocument();
    });

    it('メモが表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      expect(screen.getByText('テストメモ')).toBeInTheDocument();
    });

    it('故人の場合は没年月日が表示されること', () => {
      const deceased: Person = {
        ...BASE_PERSON,
        id: 'person-003',
        deathYear: 2020,
        deathMonth: 6,
        deathDay: 15,
        isAlive: false,
      };
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'person', id: 'person-003' },
            persons: [deceased],
          })}
        />
      );

      expect(screen.getByText('2020/06/15')).toBeInTheDocument();
    });

    it('パネルに "人物詳細" ヘッダーが表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      expect(screen.getByText('人物詳細')).toBeInTheDocument();
    });

    it('人物が見つからない場合は notFound メッセージが表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'person', id: 'nonexistent-id' },
          })}
        />
      );

      expect(screen.getByText('人物が見つかりませんでした。')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. 婚姻ノード選択時に配偶者名・婚姻種別が表示される
  // -------------------------------------------------------------------------
  describe('婚姻ノード選択時のコンテンツ', () => {
    it('配偶者1の名前が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
    });

    it('配偶者2の名前が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      expect(screen.getByText('田中 花子')).toBeInTheDocument();
    });

    it('婚姻種別 "法律婚" が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      expect(screen.getByText('法律婚')).toBeInTheDocument();
    });

    it('婚姻ステータス "婚姻中" が表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      expect(screen.getByText('婚姻中')).toBeInTheDocument();
    });

    it('パネルに "婚姻詳細" ヘッダーが表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      expect(screen.getByText('婚姻詳細')).toBeInTheDocument();
    });

    it('婚姻情報が見つからない場合は notFound メッセージが表示されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'marriage', id: 'nonexistent-relation' },
          })}
        />
      );

      expect(screen.getByText('婚姻情報が見つかりませんでした。')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 4. オーバーレイクリックで onClose が呼ばれる
  // -------------------------------------------------------------------------
  describe('オーバーレイクリックで閉じる', () => {
    it('オーバーレイ（aria-hidden=true の div）をクリックすると onClose が呼ばれること', () => {
      const onClose = jest.fn();
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'person', id: 'person-001' },
            onClose,
          })}
        />
      );

      // オーバーレイは aria-hidden="true" の最初の div
      const overlay = document.querySelector('[aria-hidden="true"]');
      expect(overlay).toBeInTheDocument();

      // オーバーレイ自体をクリック（e.target === e.currentTarget のパスを通る）
      fireEvent.click(overlay!, { target: overlay });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. 閉じるボタンで onClose が呼ばれる
  // -------------------------------------------------------------------------
  describe('閉じるボタン', () => {
    it('閉じるボタンをクリックすると onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'person', id: 'person-001' },
            onClose,
          })}
        />
      );

      const closeButton = screen.getByRole('button', { name: 'パネルを閉じる' });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. パネル内クリックでは閉じない
  // -------------------------------------------------------------------------
  describe('パネル内クリックでは閉じない', () => {
    it('パネル本体（role=dialog）をクリックしても onClose が呼ばれないこと', () => {
      const onClose = jest.fn();
      render(
        <NodeDetailPanel
          {...makeProps({
            selectedNode: { kind: 'person', id: 'person-001' },
            onClose,
          })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel).toBeInTheDocument();

      // パネル本体をクリック（stopPropagation により onClose は呼ばれない）
      fireEvent.click(panel!);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. アクセシビリティ
  // -------------------------------------------------------------------------
  describe('アクセシビリティ', () => {
    it('role="dialog" が設定されていること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
    });

    it('aria-modal="true" が設定されていること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel).toHaveAttribute('aria-modal', 'true');
    });

    it('aria-label が人物名を含んでいること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.getAttribute('aria-label') ?? '').toContain('田中 太郎');
    });

    it('婚姻ノード選択時の aria-label が設定されていること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'marriage', id: 'relation-001' } })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.getAttribute('aria-label') ?? '').toContain('婚姻関係');
    });

    it('閉じるボタンに aria-label="パネルを閉じる" が設定されていること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      expect(screen.getByRole('button', { name: 'パネルを閉じる' })).toBeInTheDocument();
    });

    it('パネルが開いている場合 aria-hidden=false であること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel).toHaveAttribute('aria-hidden', 'false');
    });
  });

  // -------------------------------------------------------------------------
  // 8. CSS Modules クラス確認
  // -------------------------------------------------------------------------
  describe('CSS Modules クラス', () => {
    it('パネルが開いているとき panelOpen クラスが付与されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panelOpen');
    });

    it('パネルに panel クラスが付与されていること', () => {
      render(<NodeDetailPanel {...makeProps()} />);

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panel');
    });

    it('オーバーレイが開いているとき overlayVisible クラスが付与されること', () => {
      render(
        <NodeDetailPanel
          {...makeProps({ selectedNode: { kind: 'person', id: 'person-001' } })}
        />
      );

      // オーバーレイは aria-hidden="true" の最初の div
      const overlay = document.querySelector('[aria-hidden="true"]');
      expect(overlay?.className ?? '').toContain('overlayVisible');
    });
  });
});
