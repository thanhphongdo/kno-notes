import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/features/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Kno-Notes';

export default function LoginPage() {
  return (
    // The form reads `?next=` from the query string, which needs a boundary.
    <Suspense>
      <LoginForm appName={APP_NAME} showDemoHint={process.env.NODE_ENV !== 'production'} />
    </Suspense>
  );
}
