import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Không tìm thấy trang' };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-bg p-24 text-center text-text">
      <span
        aria-hidden="true"
        className="flex h-40 w-40 items-center justify-center rounded-11 bg-accent font-serif text-22 font-bold text-accent-ink"
      >
        K
      </span>
      <div className="font-serif text-22 font-semibold">Không tìm thấy trang</div>
      <Link href="/" className="text-14 text-accent">Về trang chủ</Link>
    </div>
  );
}
