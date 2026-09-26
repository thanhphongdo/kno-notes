'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { DeleteConfirmBanner, EmptyState, SectionLabel } from '@/components/shared';
import { fmt } from '@/lib/text';
import type { ApiKey } from '@/lib/types';
import { McpSnippet } from './mcp-snippet';

export const REVOKE_CONFIRM_MESSAGE = 'Thu hồi key này? Các ứng dụng đang dùng sẽ mất quyền truy cập.';
export const SECRET_WARNING = 'Chỉ hiển thị một lần. Lưu lại trước khi rời trang.';

export interface ApiKeysClientProps {
  /** Origin of the running app, resolved server-side from the request headers. */
  baseUrl: string;
}

/**
 * API key management.
 *
 * The plaintext key exists on the client for exactly one render pass: `POST`
 * returns it once, it is held in component state so the user can copy it, and
 * "Đã lưu" drops it. `GET` only ever returns prefixes, so a reload cannot bring
 * it back — which is the whole point, and why the warning is not optional.
 */
export function ApiKeysClient({ baseUrl }: ApiKeysClientProps) {
  const { flash } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/api-keys');
      if (!res.ok) return;
      const body = (await res.json()) as { keys?: ApiKey[] };
      if (Array.isArray(body.keys)) setKeys(body.keys);
    } catch {
      /* offline: the page still explains how to wire a client up */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(
    (text: string) => {
      void (async () => {
        try {
          await navigator.clipboard.writeText(text);
          flash('Đã sao chép');
        } catch {
          flash('Không sao chép được');
        }
      })();
    },
    [flash],
  );

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        flash('Không tạo được key');
        return;
      }
      const created = (await res.json()) as { key: string };
      setSecret(created.key);
      setName('');
      await load();
    } catch {
      flash('Không tạo được key');
    } finally {
      setBusy(false);
    }
  }, [busy, flash, load, name]);

  const revoke = useCallback(
    async (id: string) => {
      setConfirming(null);
      try {
        const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) {
          flash('Không thu hồi được key');
          return;
        }
        flash('Đã thu hồi key');
        await load();
      } catch {
        flash('Không thu hồi được key');
      }
    },
    [flash, load],
  );

  return (
    <div className="mx-auto flex w-full max-w-1120 flex-col gap-28 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <div className="flex flex-col gap-6">
        <h1 className="m-0 font-serif text-26 font-semibold leading-[1.15] tracking-[-.02em] min-[820px]:text-32">
          API key
        </h1>
        <p className="m-0 text-14 leading-[1.5] text-muted">
          Cấp quyền cho Claude Code hoặc Codex đọc và soạn ghi chú qua REST API và MCP.
        </p>
      </div>

      <section className="flex flex-col gap-10">
        <SectionLabel>Tạo key mới</SectionLabel>
        <div className="flex flex-wrap gap-8">
          <Input
            value={name}
            inputSize="40"
            placeholder="Tên key, VD: Claude Code"
            aria-label="Tên key"
            className="min-w-220 flex-1"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <Button variant="primary" size="40" disabled={busy} onClick={() => void create()}>
            Tạo key
          </Button>
        </div>

        {secret ? (
          <div className="flex flex-col gap-8 rounded-12 bg-accent-soft py-14 px-16">
            <div className="flex flex-wrap items-center gap-10">
              <code className="min-w-0 flex-1 break-all font-mono text-13 text-text">{secret}</code>
              <Button variant="secondary" size="32" radius="8" icon="copy" onClick={() => copy(secret)}>
                Sao chép khoá
              </Button>
              <Button variant="ghost" size="32" radius="8" onClick={() => setSecret(null)}>
                Đã lưu
              </Button>
            </div>
            <span className="text-12 text-muted">{SECRET_WARNING}</span>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-10">
        <SectionLabel>Key đang hoạt động</SectionLabel>
        {keys.length === 0 ? (
          <EmptyState title="Chưa có key nào" description="Tạo key đầu tiên để kết nối trợ lý AI." />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-14 border border-line bg-surface">
            {keys.map((row, i) => (
              <div
                key={row.id}
                className={`flex flex-wrap items-center gap-16 py-16 px-18 ${i ? 'border-t border-line' : ''}`}
              >
                <div className="flex min-w-180 flex-1 flex-col gap-3">
                  <span className="text-14 font-medium">{row.name}</span>
                  <span className="font-mono text-12 text-faint">
                    {`${row.prefix}… · tạo ${fmt(row.createdAt)} · ${
                      row.lastUsedAt ? `dùng ${fmt(row.lastUsedAt)}` : 'chưa dùng'
                    }`}
                  </span>
                </div>
                <Button variant="dangerGhost" size="32" radius="8" onClick={() => setConfirming(row.id)}>
                  Thu hồi
                </Button>
                {confirming === row.id ? (
                  <DeleteConfirmBanner
                    message={REVOKE_CONFIRM_MESSAGE}
                    confirmLabel="Thu hồi vĩnh viễn"
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => void revoke(row.id)}
                    className="basis-full"
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <McpSnippet baseUrl={baseUrl} onCopy={copy} />
    </div>
  );
}
