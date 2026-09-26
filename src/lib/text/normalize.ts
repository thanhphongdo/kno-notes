// src/lib/text/normalize.ts

/**
 * Chuẩn hoá tiếng Việt — port nguyên văn từ prototype:
 *   s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')
 *
 * `đ` không tách được bằng NFD nên phải thay riêng, và phải thay SAU khi
 * đã toLowerCase (để `Đ` cũng thành `d`).
 */
export const norm = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/** Cắt chuỗi — port nguyên văn từ prototype. */
export const clip = (s: string, n = 150): string =>
  s.length > n ? s.slice(0, n - 1).trim() + '…' : s;

/** Slug ASCII ổn định cho tag, dùng làm khoá duy nhất theo user. */
export const slugify = (s: string): string =>
  norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tag';
