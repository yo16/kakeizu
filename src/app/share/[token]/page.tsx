/**
 * /share/[token] 公開閲覧ページ
 *
 * - 未認証アクセス可能 (middleware.ts の matcher で除外済み)
 * - Service Role クライアント経由でトークンに紐づくツリーデータを取得
 * - generateMetadata によるOGP設定
 * - トークン無効・期限切れ時は notFound()
 *
 * ツリー表示: B案 (閲覧専用人物リスト) を採用
 * TreeCanvasWithPanel は編集 UI (Server Actions 呼び出し) を含むため、
 * 未認証の共有ページでそのまま流用するとビルドエラーの可能性がある。
 * MVP として人物リスト表示で対応する。
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getSharedTree } from '@/features/share/lib/get-shared-tree';

import styles from './page.module.css';

interface PageParams {
  token: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedTree(token);

  if (!shared) {
    return {
      title: '共有ページが見つかりません',
      robots: { index: false },
    };
  }

  return {
    title: `${shared.tree.name} - 家系図`,
    description: `${shared.tree.name} の家系図を閲覧する`,
    openGraph: {
      title: `${shared.tree.name} - 家系図`,
      description: `${shared.tree.name} の家系図を閲覧する`,
      // og:image は MVP では未対応
      // 写真 URL の生成には Storage 署名 URL が必要であり、
      // 共有ページ用の代表写真選定ロジックが未実装のため省略する
    },
    // 検索エンジンインデックスを抑制 (家族のプライベートデータのため)
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;
  const shared = await getSharedTree(token);

  if (!shared) {
    notFound();
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <span className={styles.badge}>閲覧専用</span>
        <h1 className={styles.title}>{shared.tree.name}</h1>
        <p className={styles.summary}>
          {shared.persons.length} 人 · {shared.relations.length} 件の関係
        </p>
      </header>

      {shared.persons.length === 0 ? (
        <p className={styles.summary}>この家系図にはまだ人物が登録されていません。</p>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>人物一覧</h2>
          <ul className={styles.personList} aria-label="人物一覧">
            {shared.persons.map((person) => {
              const meta = buildPersonMeta(person);
              return (
                <li key={person.id} className={styles.personCard}>
                  <p className={styles.personName}>{person.displayName}</p>
                  {meta && <p className={styles.personMeta}>{meta}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

/**
 * 人物の生没年・性別からメタ情報文字列を生成する。
 */
function buildPersonMeta(person: {
  gender: string | null;
  birthYear: number | null;
  deathYear: number | null;
  isAlive: boolean;
}): string {
  const parts: string[] = [];

  if (person.gender) {
    const genderLabel: Record<string, string> = {
      male: '男性',
      female: '女性',
      other: 'その他',
      unknown: '不明',
    };
    parts.push(genderLabel[person.gender] ?? person.gender);
  }

  if (person.birthYear) {
    parts.push(`${person.birthYear}年生`);
  }

  if (!person.isAlive && person.deathYear) {
    parts.push(`${person.deathYear}年没`);
  }

  return parts.join(' · ');
}
