/**
 * TreeCanvas コンポーネントのテスト
 *
 * SVG 描画、ノード/エッジ数、フィットボタン、クリックハンドラ、ズーム範囲を検証する。
 *
 * jsdom では d3-zoom の DOM イベントが完全動作しないため、d3-zoom をモックして
 * コンポーネントのロジック部分 (状態管理・Props 伝搬) に集中してテストする。
 */

// ─── d3-zoom モック ──────────────────────────────────────────────────────────
// jsdom では getBoundingClientRect() が常に 0 を返し、d3-zoom のイベントハンドラが
// 正常動作しないため、最低限の振る舞いをスタブする。
const mockZoomOn = jest.fn().mockReturnThis();
const mockZoomScaleExtent = jest.fn().mockReturnThis();

const mockZoomIdentity = { x: 0, y: 0, k: 1, translate: jest.fn(), scale: jest.fn() };
mockZoomIdentity.translate = jest.fn().mockReturnValue(mockZoomIdentity);
mockZoomIdentity.scale = jest.fn().mockReturnValue(mockZoomIdentity);

jest.mock('d3-zoom', () => ({
  zoom: jest.fn(() => ({
    scaleExtent: mockZoomScaleExtent,
    on: mockZoomOn,
  })),
  zoomIdentity: mockZoomIdentity,
}));

// ─── d3-selection モック ─────────────────────────────────────────────────────
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

// ─── imports ─────────────────────────────────────────────────────────────────
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreeCanvas } from '../TreeCanvas';
import {
  type TreeLayout,
  type PersonNode,
  type MarriageNode,
  type HierarchyNode,
  type TreeEdge,
} from '../../types';

// ─── テストデータ ──────────────────────────────────────────────────────────────

const PERSON_A: PersonNode = {
  type: 'person',
  id: 'person-a',
  generation: 0,
  x: 0,
  y: 0,
  displayName: '田中 太郎',
  birthYear: 1950,
  deathYear: null,
  primaryPhotoUrl: null,
};

const PERSON_B: PersonNode = {
  type: 'person',
  id: 'person-b',
  generation: 0,
  x: 200,
  y: 0,
  displayName: '田中 花子',
  birthYear: 1955,
  deathYear: null,
  primaryPhotoUrl: null,
};

const PERSON_CHILD: PersonNode = {
  type: 'person',
  id: 'person-child',
  generation: 1,
  x: 100,
  y: 200,
  displayName: '田中 一郎',
  birthYear: 1980,
  deathYear: null,
  primaryPhotoUrl: null,
};

const MARRIAGE: MarriageNode = {
  type: 'marriage',
  id: 'marriage-001',
  relationId: 'relation-001',
  partnerAId: 'person-a',
  partnerBId: 'person-b',
  marriageStatus: 'current',
  marriageType: 'spouse',
  generation: 0,
  x: 100,
  y: 50,
};

const EDGE_MARRIAGE: TreeEdge = {
  id: 'edge-m1',
  kind: 'marriage_line',
  fromId: 'person-a',
  toId: 'marriage-001',
};

const EDGE_MARRIAGE2: TreeEdge = {
  id: 'edge-m2',
  kind: 'marriage_line',
  fromId: 'person-b',
  toId: 'marriage-001',
};

const EDGE_CHILD: TreeEdge = {
  id: 'edge-c1',
  kind: 'parent_child_line',
  fromId: 'marriage-001',
  toId: 'person-child',
  parentRole: 'biological',
};

const EMPTY_LAYOUT: TreeLayout = {
  nodes: [],
  edges: [],
  totalWidth: 0,
  totalHeight: 0,
};

const FULL_LAYOUT: TreeLayout = {
  nodes: [PERSON_A, PERSON_B, PERSON_CHILD, MARRIAGE] as HierarchyNode[],
  edges: [EDGE_MARRIAGE, EDGE_MARRIAGE2, EDGE_CHILD],
  totalWidth: 400,
  totalHeight: 300,
};

// ─────────────────────────────────────────────────────────────────────────────

describe('TreeCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // scaleExtent の再設定
    mockZoomScaleExtent.mockReturnThis();
    mockTransition.mockReturnValue({ duration: mockDuration });
    mockDuration.mockReturnValue({ call: mockCall });
  });

  // -------------------------------------------------------------------------
  // 空 layout での描画
  // -------------------------------------------------------------------------
  describe('空 layout での描画', () => {
    it('nodes/edges が空でも SVG が描画され、エラーにならないこと', () => {
      render(<TreeCanvas layout={EMPTY_LAYOUT} />);

      // aria-label でキャンバスの SVG を探す
      const svg = screen.getByRole('img', { name: '家系図キャンバス' });
      expect(svg).toBeInTheDocument();
    });

    it('nodes/edges が空のときノードが描画されないこと', () => {
      render(<TreeCanvas layout={EMPTY_LAYOUT} />);

      // foreignObject が存在しない (PersonNode は foreignObject で描画)
      const foreignObjects = document.querySelectorAll('foreignObject');
      expect(foreignObjects).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // ノード描画数
  // -------------------------------------------------------------------------
  describe('ノード描画数', () => {
    it('PersonNode が layout の person ノード数だけ描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      // PersonNode は foreignObject で描画される
      const foreignObjects = document.querySelectorAll('foreignObject');
      // FULL_LAYOUT の person ノードは 3 (PERSON_A, PERSON_B, PERSON_CHILD)
      expect(foreignObjects).toHaveLength(3);
    });

    it('MarriageNode が layout の marriage ノード数だけ描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      // MarriageNode は polygon で描画される
      const polygons = document.querySelectorAll('polygon');
      // FULL_LAYOUT の marriage ノードは 1
      expect(polygons).toHaveLength(1);
    });

    it('layout 内の人物名が表示されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      expect(screen.getByText('田中 太郎')).toBeInTheDocument();
      expect(screen.getByText('田中 花子')).toBeInTheDocument();
      expect(screen.getByText('田中 一郎')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // エッジ描画数
  // -------------------------------------------------------------------------
  describe('エッジ描画数', () => {
    it('layout 内のエッジ数だけ path 要素が描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      // FULL_LAYOUT は marriage_line × 2 + parent_child_line × 1 = 3 エッジ
      const paths = document.querySelectorAll('path[aria-hidden="true"]');
      expect(paths).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // フィットボタン
  // -------------------------------------------------------------------------
  describe('フィットボタン', () => {
    it('フィットボタンが描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      const fitButton = screen.getByRole('button', { name: '全体表示にフィット' });
      expect(fitButton).toBeInTheDocument();
    });

    it('フィットボタンをクリックしてもエラーにならないこと (smoke test)', async () => {
      const user = userEvent.setup();
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      const fitButton = screen.getByRole('button', { name: '全体表示にフィット' });
      // jsdom + d3-zoom モック下では変換は適用されないが、エラーにならないことを確認
      await expect(user.click(fitButton)).resolves.not.toThrow();
    });

    it('100%表示ボタンが描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      const resetButton = screen.getByRole('button', { name: '100%表示' });
      expect(resetButton).toBeInTheDocument();
    });

    it('ツールバーが aria-label 付きで描画されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      expect(screen.getByRole('toolbar', { name: 'ズームコントロール' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // クリックハンドラ
  // -------------------------------------------------------------------------
  describe('クリックハンドラ', () => {
    it('onPersonClick が渡された場合: PersonNode クリックでハンドラが呼ばれること', async () => {
      const user = userEvent.setup();
      const onPersonClick = jest.fn();
      render(<TreeCanvas layout={FULL_LAYOUT} onPersonClick={onPersonClick} />);

      // PersonNode は foreignObject 内の button role で描画される
      const personButtons = screen.getAllByRole('button');
      // フィット・リセットボタンを除いた person ボタン (クリッカブル)
      const personNodeButtons = personButtons.filter(
        (btn) =>
          btn.getAttribute('aria-label') !== '全体表示にフィット' &&
          btn.getAttribute('aria-label') !== '100%表示'
      );

      expect(personNodeButtons.length).toBeGreaterThan(0);

      await user.click(personNodeButtons[0]);

      expect(onPersonClick).toHaveBeenCalledTimes(1);
    });

    it('onMarriageClick が渡された場合: MarriageNode クリックでハンドラが呼ばれること', async () => {
      const user = userEvent.setup();
      const onMarriageClick = jest.fn();
      render(<TreeCanvas layout={FULL_LAYOUT} onMarriageClick={onMarriageClick} />);

      // MarriageNode は onClick があると button role が付与される
      const marriageButton = screen.getByRole('button', { name: /婚姻ノード/ });
      await user.click(marriageButton);

      expect(onMarriageClick).toHaveBeenCalledTimes(1);
      expect(onMarriageClick).toHaveBeenCalledWith('marriage-001');
    });
  });

  // -------------------------------------------------------------------------
  // ズームレベル表示
  // -------------------------------------------------------------------------
  describe('ズームレベル表示', () => {
    it('初期状態でズームレベルが表示されること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      // zoomIdentity の k=1 → 100%
      const zoomDisplay = screen.getByText(/\d+%/);
      expect(zoomDisplay).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // ズーム範囲定数
  // -------------------------------------------------------------------------
  describe('ズーム範囲定数', () => {
    it('d3-zoom の scaleExtent が [0.25, 4] で呼ばれること', () => {
      render(<TreeCanvas layout={FULL_LAYOUT} />);

      // zoom() → scaleExtent([0.25, 4]) の呼び出しを確認
      expect(mockZoomScaleExtent).toHaveBeenCalledWith([0.25, 4]);
    });
  });
});
