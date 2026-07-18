import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bible Hybrid Search',
  description: 'Semantic + exact-match Bible search',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
