// src/lib/text/html.ts
import { parseHTML } from 'linkedom';

export interface Section {
  h: string;
  items: string[];
}

/**
 * Tách ghi chú thành các mục theo H2/H3 — port nguyên văn từ prototype
 * (`sections()`), thay `DOMParser` bằng `linkedom` để chạy được trên server.
 */
export function sections(html: string | null | undefined): Section[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html || ''}</body></html>`);
  const out: Section[] = [];
  let cur: Section | null = null;

  for (const el of Array.from(document.body.children) as Element[]) {
    const tag = el.tagName;
    if (tag === 'H2' || tag === 'H3') {
      cur = { h: (el.textContent || '').trim(), items: [] };
      out.push(cur);
    } else if (cur && (tag === 'UL' || tag === 'OL')) {
      const open = cur;
      el.querySelectorAll('li').forEach((li: Element) => {
        open.items.push((li.textContent || '').trim());
      });
    } else if (cur && (tag === 'P' || tag === 'BLOCKQUOTE')) {
      const t = (el.textContent || '').trim();
      if (t) cur.items.push(t);
    } else if (cur && tag === 'TABLE') {
      const open = cur;
      el.querySelectorAll('tr').forEach((tr: Element, i: number) => {
        if (!i) return;
        open.items.push(
          (Array.from(tr.children) as Element[])
            .map((td) => (td.textContent || '').trim())
            .join(' — '),
        );
      });
    }
  }

  return out.filter((s) => s.items.length > 0);
}

/** Văn bản thuần từ HTML — port nguyên văn từ prototype (`replace(/<[^>]+>/g,' ')`). */
export const stripHtml = (html: string | null | undefined): string =>
  (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
