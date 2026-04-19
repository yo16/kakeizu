import type { Metadata } from 'next';
import '../styles/reset.css';
import '../styles/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: '家系図 | kakeizu',
  description: '家族の歴史を記録・共有できる家系図サービス',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
