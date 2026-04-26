/**
 * TreeCanvasWithPanel コンポーネントのテスト
 *
 * - 空データでの初期表示
 * - PersonNode クリックで selectedId 更新
 * - MarriageNode クリックで selectedId 更新 (marriage: プレフィックス対応)
 * - URL ?node={id}&nodeKind={kind} で初期 selectedId が設定される
 * - パネルを閉じると router.replace で ?node 削除
 * - selectedId の変更で TreeCanvas に正しい props が渡される
 *
 * useSearchParams / useRouter をモックして next/navigation 依存を排除する。
 * d3-zoom は TreeCanvas.test.tsx と同じパターンでモックする。
 */

// ─── d3-zoom / d3-selection モック ────────────────────────────────────────────
jest.mock('d3-zoom', () => ({
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    transform: jest.fn(),
  })),
  zoomIdentity: {
    x: 0,
    y: 0,
    k: 1,
    translate: jest.fn().mockReturnThis(),
    scale: jest.fn().mockReturnThis(),
  },
}));

const mockCall = jest.fn().mockReturnThis();
const mockOn = jest.fn().mockReturnThis();
const mockTransition = jest.fn().mockReturnThis();
const mockDuration = jest.fn().mockReturnThis();

jest.mock('d3-selection', () => ({
  select: jest.fn(() => ({
    call: mockCall,
    on: mockOn,
    transition: mockTransition,
  })),
}));

jest.mock('d3-transition', () => ({}));

// ─── next/navigation モック ───────────────────────────────────────────────────
const mockReplace = jest.fn();
const mockSearchParamsGet = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
    entries: () => [][Symbol.iterator](),
  }),
}));

// ─── EditPersonDrawer モック ──────────────────────────────────────────────────
jest.mock('@/features/person/components/EditPersonDrawer', () => ({
  EditPersonDrawer: () => null,
}));

// ─── formatPartialDate モック ─────────────────────────────────────────────────
jest.mock('@/lib/date/partial-date', () => ({
  formatPartialDate: ({ year }: { year: number | null }) => (year != null ? String(year) : ''),
}));

// ─── imports ─────────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreeCanvasWithPanel } from '../TreeCanvasWithPanel';
import type { Person } from '@/features/person/actions/get-person';
import type { PhotoSummary } from '@/features/photo/actions/get-photos';
import type { RelationRow } from '@/features/relation/actions';

// ─── テストデータ ──────────────────────────────────────────────────────────────

const PERSON_A: Person = {
  id: 'person-a',
  treeId: 'tree-001',
  displayName: '田中 太郎',
  familyName: '田中',
  givenName: '太郎',
  maidenName: null,
  gender: 'male',
  birthYear: 1950,
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

const PERSON_B: Person = {
  id: 'person-b',
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

const MARRIAGE_RELATION: RelationRow = {
  id: 'relation-001',
  treeId: 'tree-001',
  kind: 'marriage',
  fromPersonId: 'person-a',
  toPersonId: 'person-b',
  parentRole: null,
  marriageType: 'spouse',
  marriageStatus: 'current',
  startYear: 1975,
  startMonth: null,
  endYear: null,
  endMonth: null,
  note: null,
  createdAt: '2024-01-01T00:00:00Z',
};

const EMPTY_PHOTOS: PhotoSummary[] = [];

// ─────────────────────────────────────────────────────────────────────────────

describe('TreeCanvasWithPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransition.mockReturnValue({ duration: mockDuration });
    mockDuration.mockReturnValue({ call: mockCall });
    // デフォルト: URL クエリなし
    mockSearchParamsGet.mockReturnValue(null);

    // window.location.pathname のモック
    // jsdom では window.location は configurable: false のため Object.defineProperty で再定義できない。
    // history.replaceState を使って pathname を書き換える。
    window.history.replaceState(null, '', '/trees/tree-001');
  });

  // -------------------------------------------------------------------------
  // 1. 空データでの初期表示
  // -------------------------------------------------------------------------
  describe('空データでの初期表示', () => {
    it('persons/relations が空配列でも SVG が描画されること', () => {
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[]}
          photos={[]}
          relations={[]}
        />
      );

      // TreeCanvas が描画する SVG (aria-label="家系図キャンバス")
      expect(screen.getByRole('img', { name: '家系図キャンバス' })).toBeInTheDocument();
    });

    it('空データで何も選択されていない状態では NodeDetailPanel が非表示であること', () => {
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[]}
          photos={[]}
          relations={[]}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      // パネルは存在するが panelOpen クラスがないこと
      expect(panel?.className ?? '').not.toContain('panelOpen');
    });
  });

  // -------------------------------------------------------------------------
  // 2. PersonNode をクリックすると selectedId が更新される
  // -------------------------------------------------------------------------
  describe('PersonNode クリックで selectedId 更新', () => {
    it('PersonNode をクリックすると NodeDetailPanel が開くこと', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      // PersonNode の button を取得（フィット・リセットボタン以外）
      const allButtons = screen.getAllByRole('button');
      const personButtons = allButtons.filter(
        (btn) =>
          btn.getAttribute('aria-label') !== '全体表示にフィット' &&
          btn.getAttribute('aria-label') !== '100%表示'
      );

      expect(personButtons.length).toBeGreaterThan(0);

      await user.click(personButtons[0]);

      // パネルが開くこと
      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panelOpen');
    });

    it('PersonNode クリック後に router.replace が呼ばれること', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A]}
          photos={EMPTY_PHOTOS}
          relations={[]}
        />
      );

      const allButtons = screen.getAllByRole('button');
      const personButtons = allButtons.filter(
        (btn) =>
          btn.getAttribute('aria-label') !== '全体表示にフィット' &&
          btn.getAttribute('aria-label') !== '100%表示'
      );

      await user.click(personButtons[0]);

      expect(mockReplace).toHaveBeenCalled();
      const calledUrl: string = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(calledUrl).toContain('node=person-a');
      expect(calledUrl).toContain('nodeKind=person');
    });
  });

  // -------------------------------------------------------------------------
  // 3. MarriageNode をクリックすると selectedId が更新される (marriage: プレフィックス対応)
  // -------------------------------------------------------------------------
  describe('MarriageNode クリックで selectedId 更新', () => {
    it('MarriageNode をクリックすると NodeDetailPanel が開くこと', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      // MarriageNode は button role + aria-label が婚姻ノード
      const marriageButton = screen.getByRole('button', { name: /婚姻ノード/ });
      await user.click(marriageButton);

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panelOpen');
    });

    it('MarriageNode クリック後に router.replace で nodeKind=marriage が設定されること', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const marriageButton = screen.getByRole('button', { name: /婚姻ノード/ });
      await user.click(marriageButton);

      expect(mockReplace).toHaveBeenCalled();
      const calledUrl: string = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(calledUrl).toContain('nodeKind=marriage');
    });

    it('MarriageNode クリック後に URL の node パラメータが relation.id になること', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const marriageButton = screen.getByRole('button', { name: /婚姻ノード/ });
      await user.click(marriageButton);

      expect(mockReplace).toHaveBeenCalled();
      const calledUrl: string = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      // TreeCanvas から渡される id は "marriage:relation-001" → strip して "relation-001"
      expect(calledUrl).toContain('node=relation-001');
    });
  });

  // -------------------------------------------------------------------------
  // 4. URL ?node={id} で初期 selectedId が設定される
  // -------------------------------------------------------------------------
  describe('URL クエリで初期 selectedId が設定される', () => {
    it('?node=person-a&nodeKind=person でパネルが開いた状態になること', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'person-a';
        if (key === 'nodeKind') return 'person';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panelOpen');
    });

    it('?node=relation-001&nodeKind=marriage でパネルが開いた状態になること', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'relation-001';
        if (key === 'nodeKind') return 'marriage';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const panel = document.querySelector('[role="dialog"]');
      expect(panel?.className ?? '').toContain('panelOpen');
    });

    it('?node={id} のみ (nodeKind なし) で person として扱われること', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'person-a';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      // person-a に対応する人物名がパネルに表示されること
      // PersonNode と NodeDetailPanel 両方に名前が出るため getAllByText で確認する
      expect(screen.getAllByText('田中 太郎').length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. パネルを閉じると router.replace で ?node 削除
  // -------------------------------------------------------------------------
  describe('パネルを閉じると URL から node が削除される', () => {
    it('閉じるボタンをクリックすると router.replace が ?node なしで呼ばれること', async () => {
      const user = userEvent.setup();
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'person-a';
        if (key === 'nodeKind') return 'person';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const closeButton = screen.getByRole('button', { name: 'パネルを閉じる' });
      await user.click(closeButton);

      // 最後の replace 呼び出しに node パラメータが含まれないこと
      expect(mockReplace).toHaveBeenCalled();
      const lastCallUrl: string = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(lastCallUrl).not.toContain('node=');
    });
  });

  // -------------------------------------------------------------------------
  // 6. selectedId の変更で TreeCanvas に正しい props が渡される
  // -------------------------------------------------------------------------
  describe('selectedId の TreeCanvas への伝搬', () => {
    it('PersonNode クリック後に対応するノードが選択状態になること (isSelected class)', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      // PersonNode をクリック
      const allButtons = screen.getAllByRole('button');
      const personButtons = allButtons.filter(
        (btn) =>
          btn.getAttribute('aria-label') !== '全体表示にフィット' &&
          btn.getAttribute('aria-label') !== '100%表示' &&
          !btn.getAttribute('aria-label')?.includes('婚姻ノード')
      );

      await user.click(personButtons[0]);

      // 選択されたノードに selected クラスが付与されること
      const selectedNodes = document.querySelectorAll('[class*="selected"]');
      expect(selectedNodes.length).toBeGreaterThan(0);
    });

    it('MarriageNode クリック後に婚姻ノードが選択状態になること (isSelected class)', async () => {
      const user = userEvent.setup();
      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const marriageButton = screen.getByRole('button', { name: /婚姻ノード/ });
      await user.click(marriageButton);

      // polygon の selected クラス
      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('selected');
    });
  });

  // -------------------------------------------------------------------------
  // 7. PersonNode/MarriageNode の isSelected 連携
  // -------------------------------------------------------------------------
  describe('PersonNode/MarriageNode の isSelected 連携', () => {
    it('URL から person が選択された状態で対応する PersonNode が選択クラスを持つこと', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'person-a';
        if (key === 'nodeKind') return 'person';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      // person-a に対応する PersonNode の div に selected クラスがあること
      // PersonNode と NodeDetailPanel 両方に名前が出るため getAllByText で PersonNode 側の要素を取得する
      const personNodeEl = screen
        .getAllByText('田中 太郎')[0]
        .closest('[class*="node"]');
      expect(personNodeEl?.className ?? '').toContain('selected');
    });

    it('URL から marriage が選択された状態で polygon が selected クラスを持つこと', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'node') return 'relation-001';
        if (key === 'nodeKind') return 'marriage';
        return null;
      });

      render(
        <TreeCanvasWithPanel
          treeId="tree-001"
          persons={[PERSON_A, PERSON_B]}
          photos={EMPTY_PHOTOS}
          relations={[MARRIAGE_RELATION]}
        />
      );

      const polygon = document.querySelector('polygon');
      expect(polygon?.className.baseVal ?? polygon?.getAttribute('class') ?? '').toContain('selected');
    });
  });
});
