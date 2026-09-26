'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label } from '@/components/ui';
import { BRAND_MARK } from '@/components/shared';
import { dashboardPath } from '@/lib/nav/paths';

/** Verbatim from the prototype — one sentence, one full stop, no exclamation. */
export const LOGIN_ERROR = 'Sai tên đăng nhập hoặc mật khẩu.';

/**
 * `middleware.ts` appends `?next=` when it bounces a signed-out visitor off a
 * protected page. Only a same-origin, absolute path is honoured: anything that
 * could leave the origin — a full URL, a protocol-relative `//host`, or a
 * `javascript:` URL — is an open-redirect and is thrown away.
 */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export interface LoginFormProps {
  appName: string;
  /** `process.env.NODE_ENV !== 'production'` (contracts §4). */
  showDemoHint: boolean;
}

export function LoginForm({ appName, showDemoHint }: LoginFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const usernameId = useId();
  const passwordId = useId();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The username is trimmed because a trailing space is always a typo.
        // The password never is — a space can be a deliberate character.
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        // Deliberately the same message for "no such user" and "wrong
        // password": which one it was is not the visitor's business.
        setError(LOGIN_ERROR);
        return;
      }
      router.replace(safeNext(params.get('next')) ?? dashboardPath());
      router.refresh();
    } catch {
      setError(LOGIN_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-380 flex-col gap-28">
      <div className="flex flex-col gap-14">
        <span
          aria-hidden="true"
          className="flex h-40 w-40 items-center justify-center rounded-11 bg-accent font-serif text-22 font-bold text-accent-ink"
        >
          {BRAND_MARK}
        </span>
        <h1 className="m-0 font-serif text-32 font-semibold leading-[1.15] tracking-[-.02em]">
          {appName}
        </h1>
        <p className="m-0 text-15 leading-[1.5] text-muted">
          Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.
        </p>
      </div>

      <div className="flex flex-col gap-14">
        <Label stacked htmlFor={usernameId}>
          Tên đăng nhập
          <Input
            id={usernameId}
            inputSize="46"
            tone="strong"
            value={username}
            autoComplete="username"
            placeholder="bacsi"
            invalid={Boolean(error)}
            onChange={(event) => {
              setUsername(event.target.value);
              setError('');
            }}
          />
        </Label>

        <Label stacked htmlFor={passwordId}>
          Mật khẩu
          <Input
            id={passwordId}
            type="password"
            inputSize="46"
            tone="strong"
            value={password}
            autoComplete="current-password"
            placeholder="••••••"
            invalid={Boolean(error)}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
          />
        </Label>

        {error ? (
          <div role="alert" className="text-13 text-hi">
            {error}
          </div>
        ) : null}

        <Button type="submit" variant="ink" size="46" fullWidth disabled={busy} className="mt-6">
          Đăng nhập
        </Button>
      </div>

      {showDemoHint ? (
        <div className="font-mono text-12 text-faint">Demo · bacsi / 123456</div>
      ) : null}
    </form>
  );
}
