// src/lib/text/image-alts.ts
//
// Văn bản thay thế (alt) của ảnh — để tìm kiếm.
//
// Ảnh của một ghi chú nằm ở HAI nơi và cả hai đều mang alt:
//   • `note.images[].label` — ảnh đính kèm, hiện dưới mỗi thumbnail;
//   • `<img alt="…">` nằm ngay trong nội dung (ảnh lồng trong bài).
// Hàm này gộp cả hai, bỏ trùng, để người dùng gõ "sơ đồ bậc điều trị" là ra
// ghi chú dù họ chỉ nhớ tấm hình chứ không nhớ chữ nào trong bài.
//
// DOM-free vì cùng lý do như `./highlights`: chạy cả ở server lẫn client.

const IMG_RE = /<img\b[^>]*>/gi;
// Khoảng trắng đứng trước là bắt buộc: `data-alt=` hay `data-salt=` không
// phải alt của ảnh. Dùng `\s` thay vì lookbehind để chạy được trên Safari cũ.
const ALT_RE = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

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

/** Alt của từng `<img>` nằm trong nội dung, theo thứ tự xuất hiện. */
export function inlineImageAlts(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const tag of html.match(IMG_RE) ?? []) {
    const m = ALT_RE.exec(tag);
    if (!m) continue;
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

/** Trần khi đưa vào chỉ mục — cùng lý do như `HIGHLIGHT_INDEX_*`. */
export const IMAGE_ALT_INDEX_MAX = 60;
export const IMAGE_ALT_INDEX_CHARS = 300;

/**
 * Alt của MỌI ảnh trong một ghi chú: nhãn ảnh đính kèm trước, rồi alt của ảnh
 * lồng trong bài. Bỏ rỗng, bỏ trùng (so sánh sau khi cắt khoảng trắng), chặn
 * trần. Ảnh chưa được đặt alt thì không đóng góp gì — đúng nghĩa "có alt thì
 * mới tìm theo alt".
 */
export function imageAltTexts(
  html: string | null | undefined,
  labels: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of [...labels, ...inlineImageAlts(html)]) {
    const text = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text.length > IMAGE_ALT_INDEX_CHARS ? text.slice(0, IMAGE_ALT_INDEX_CHARS) : text);
    if (out.length >= IMAGE_ALT_INDEX_MAX) break;
  }

  return out;
}
