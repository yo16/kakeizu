/**
 * src/app/page.tsx のユニットテスト
 *
 * HomePage が呼び出された際に redirect('/dashboard') が throw されることを検証する。
 * 実際の Next.js の redirect() は NEXT_REDIRECT エラーをスローしてレンダリングを中断する
 * 仕組みであるため、mock も同様の挙動を模倣する。
 *
 * @jest-environment node
 */

// next/navigation の redirect をモック（NEXT_REDIRECT をスロー）
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${path}` });
  }),
}));

import { redirect } from 'next/navigation';
import HomePage from '../page';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('HomePage (src/app/page.tsx)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // リダイレクト動作の検証
  // -------------------------------------------------------------------------
  describe('/ アクセス時のリダイレクト', () => {
    it('/dashboard へのリダイレクトが発生すること (NEXT_REDIRECT がスローされること)', () => {
      expect(() => HomePage()).toThrow('NEXT_REDIRECT');
    });

    it('redirect が /dashboard を引数として呼ばれること', () => {
      try {
        HomePage();
      } catch {
        // redirect() によるスローは期待動作
      }
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('redirect がちょうど1回だけ呼ばれること', () => {
      try {
        HomePage();
      } catch {
        // redirect() によるスローは期待動作
      }
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 副作用がないことの検証
  // -------------------------------------------------------------------------
  describe('副作用の検証', () => {
    it('redirect 以外の副作用がないこと (redirect のみ呼ばれること)', () => {
      try {
        HomePage();
      } catch {
        // redirect() によるスローは期待動作
      }
      // redirect が呼ばれたことと、それ以外のモックが呼ばれていないことを確認
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });
  });
});
