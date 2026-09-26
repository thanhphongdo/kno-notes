// PLACEHOLDER — replaced by app task A4 (root layout, providers, fonts).
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kno-Notes',
  description: 'Sổ tay kiến thức cá nhân.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
