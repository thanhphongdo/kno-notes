// src/lib/text/highlights.ts
//
// Liệt kê các đoạn đã đánh dấu (`<mark data-hl>`) trong nội dung ghi chú.
//
// Đây là BẢN DUY NHẤT trong toàn repo. Trước đây có hai bản song song —
// `extractHighlights` (linkedom, phía server) và `collectHighlights` (regex,
// phía client) — và hai bản đó phải nhả ra đúng cùng một chuỗi, nếu không
// đoạn tìm thấy ở gợi ý sẽ khác đoạn hiện trên rail. Gộp về một bản.
//
// Cố ý KHÔNG dùng DOM: hàm này chạy trong `useMemo` của client component nên
// cũng chạy lúc server render (không có `DOMParser`), lại vừa chạy trong
// service phía server khi dựng chỉ mục. Một code path => không lệch, không
// hydration mismatch, và không kéo linkedom vào bundle trình duyệt.
//
// `wrapRange` chỉ bọc text node, nên bên trong một `<mark data-hl>` chỉ có
// text (có thể đã escape) và cùng lắm là thẻ inline của prose — bỏ thẻ rồi
// decode entity là tái tạo đúng `textContent`.

export interface CollectedHighlight {
  id: string;
  text: string;
}

const MARK_RE = /<mark\b[^>]*\bdata-hl\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/mark>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Văn bản trình duyệt sẽ báo qua `mark.textContent`. */
function markText(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, ''));
}

/**
 * Một mục cho mỗi `data-hl`; các mảnh cùng id (chọn vắt qua nhiều block) được
 * nối bằng một dấu cách, giữ nguyên thứ tự xuất hiện.
 */
export function collectHighlights(html: string | null | undefined): CollectedHighlight[] {
  if (!html) return [];
  const order: string[] = [];
  const texts = new Map<string, string>();

  for (const match of html.matchAll(MARK_RE)) {
    const id = match[1];
    const inner = match[2] ?? '';
    if (!id) continue;
    if (!texts.has(id)) {
      texts.set(id, '');
      order.push(id);
    }
    const prev = texts.get(id) ?? '';
    const next = markText(inner);
    texts.set(id, prev ? `${prev} ${next}` : next);
  }

  return order.map((id) => ({ id, text: (texts.get(id) ?? '').replace(/\s+/g, ' ').trim() }));
}

/**
 * Giới hạn khi ĐƯA VÀO CHỈ MỤC. Một hàng `note_index` và một dòng của
 * `GET /api/search/index` đi qua mạng di động, nên số đoạn và độ dài mỗi đoạn
 * đều phải có trần. Cắt cứng (không thêm `…`) vì đây là dữ liệu để so khớp,
 * không phải để hiển thị.
 */
export const HIGHLIGHT_INDEX_MAX = 60;
export const HIGHLIGHT_INDEX_CHARS = 300;

/** Chuỗi văn bản của các đoạn đánh dấu, đã bỏ mục rỗng và đã chặn trần. */
export function highlightTexts(html: string | null | undefined): string[] {
  return collectHighlights(html)
    .map((h) => h.text)
    .filter(Boolean)
    .slice(0, HIGHLIGHT_INDEX_MAX)
    .map((t) => (t.length > HIGHLIGHT_INDEX_CHARS ? t.slice(0, HIGHLIGHT_INDEX_CHARS) : t));
}
