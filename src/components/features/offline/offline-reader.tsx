'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Input } from '@/components/ui';
import { NoteBriefRow, Prose, SectionLabel, TagChip } from '@/components/shared';
import { getCachedImage, listCachedNotes, type CachedNote } from '@/lib/offline/cache';
import { imageIdFromSrc } from '@/lib/offline/keys';
import { OFFLINE_USER_KEY } from '@/hooks/use-offline-sync';
import { norm, rel } from '@/lib/text';
import type { Note } from '@/lib/types';

export const OFFLINE_EMPTY =
  'Chưa có ghi chú nào tải sẵn trên máy. Khi có mạng trở lại, app sẽ tự tải về để lần sau đọc được.';
export const OFFLINE_RETRY = 'Thử lại';
export const OFFLINE_SEARCH_PLACEHOLDER = 'Tìm trong ghi chú đã tải';

function readUserId(): string | null {
  try {
    return localStorage.getItem(OFFLINE_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Thay `src` của ảnh trong bài bằng blob đã tải sẵn.
 *
 * Ngoại tuyến thì `/api/images/...` không tới được máy chủ; ảnh sẽ hiện ra ô
 * vỡ. Bytes đã nằm trong IndexedDB từ lần tải trước, chỉ cần trỏ lại.
 */
async function withLocalImages(
  userId: string,
  html: string,
  note: Note,
): Promise<{ html: string; revoke: () => void }> {
  const urls: string[] = [];
  let out = html;

  for (const image of note.images) {
    const id = imageIdFromSrc(image.src);
    if (!id) continue;
    const cached = await getCachedImage(userId, id);
    if (!cached) continue;
    const url = URL.createObjectURL(new Blob([cached.bytes], { type: cached.type }));
    urls.push(url);
    out = out.split(image.src).join(url);
  }

  return { html: out, revoke: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

/**
 * Trình đọc cho lúc mất mạng.
 *
 * Trang này được service worker phục vụ khi một điều hướng không tới được
 * mạng, nên nó phải dựng được mà KHÔNG có phiên đăng nhập và KHÔNG gọi mạng —
 * mọi thứ nó hiển thị đều đã nằm sẵn trong IndexedDB của máy này, do lần đồng
 * bộ trước ghi xuống và được khoá theo user.
 *
 * Chỉ đọc. Sửa ghi chú cần trình soạn thảo, vốn là một route dựng ở máy chủ —
 * mất mạng thì không tới được. Những thao tác đã lỡ làm khi mạng rớt vẫn được
 * xếp hàng và gửi đi sau, xem `src/lib/offline/queue.ts`.
 */
export function OfflineReader() {
  const [rows, setRows] = useState<CachedNote[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const revoke = useRef<() => void>(() => {});
  const userId = useRef<string | null>(null);

  useEffect(() => {
    userId.current = readUserId();
    if (!userId.current) {
      setRows([]);
      return;
    }
    void listCachedNotes(userId.current).then(setRows);
  }, []);

  const open = useMemo(() => rows?.find((r) => r.noteId === openId) ?? null, [openId, rows]);

  useEffect(() => {
    revoke.current();
    revoke.current = () => {};
    if (!open || !userId.current) {
      setBody('');
      return;
    }
    let cancelled = false;
    void withLocalImages(userId.current, open.note.content, open.note).then((result) => {
      if (cancelled) {
        result.revoke();
        return;
      }
      setBody(result.html);
      revoke.current = result.revoke;
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => () => revoke.current(), []);

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter((row) => {
      const n = row.note;
      return (
        norm(n.title).includes(q) ||
        norm(n.desc).includes(q) ||
        n.tags.some((t) => norm(t).includes(q))
      );
    });
  }, [query, rows]);

  const retry = useCallback(() => window.location.reload(), []);

  if (rows == null) return null;

  return (
    <div className="flex flex-col gap-20">
      <Button variant="secondary" size="32" radius="8" onClick={retry} className="self-start px-12">
        {OFFLINE_RETRY}
      </Button>

      {rows.length === 0 ? (
        <div className="text-14 leading-[1.6] text-muted">{OFFLINE_EMPTY}</div>
      ) : open ? (
        <article data-offline-note={open.noteId} className="flex flex-col gap-14">
          <Button
            variant="ghost"
            size="32"
            radius="8"
            onClick={() => setOpenId(null)}
            className="-ml-4 self-start pr-10 pl-4"
          >
            <Icon name="chevron-left" size={16} />
            Danh sách đã tải
          </Button>
          <div className="flex flex-wrap items-center gap-8">
            {open.note.tags.map((tag) => (
              <TagChip key={tag} name={tag} hash />
            ))}
          </div>
          <h2 className="m-0 font-serif text-28 font-semibold leading-[1.15] tracking-[-.02em]">
            {open.note.title}
          </h2>
          <div className="text-13 text-faint">{`Bản đã tải · v${open.version} · ${rel(open.note.updated)}`}</div>
          <Prose html={body} />
        </article>
      ) : (
        <>
          <Input
            value={query}
            placeholder={OFFLINE_SEARCH_PLACEHOLDER}
            aria-label={OFFLINE_SEARCH_PLACEHOLDER}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-col">
            <SectionLabel size={11} className="px-14 pt-8 pb-6">
              {`Đã tải · ${rows.length}`}
            </SectionLabel>
            {matches.map((row) => (
              <NoteBriefRow
                key={row.noteId}
                title={row.note.title}
                sub={`${row.note.tags.map((t) => `#${t}`).join(' ')} · ${rel(row.note.updated)}`}
                priority={row.note.priority}
                density="comfortable"
                onClick={() => setOpenId(row.noteId)}
              />
            ))}
            {matches.length === 0 ? (
              <div className="px-14 py-20 text-center text-13 text-muted">
                {`Không có ghi chú đã tải nào khớp “${query}”`}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
