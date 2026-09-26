// src/lib/text/date.ts

/** dd/mm/yyyy theo giờ địa phương — port nguyên văn từ prototype. */
export const fmt = (s: string | Date): string => {
  const t = s instanceof Date ? s : new Date(s);
  return (
    String(t.getDate()).padStart(2, '0') +
    '/' +
    String(t.getMonth() + 1).padStart(2, '0') +
    '/' +
    t.getFullYear()
  );
};

/**
 * Thời gian tương đối — port nguyên văn từ prototype.
 * < 1 phút  → "vừa xong"
 * < 60 phút → "x phút trước"
 * < 24 giờ  → "x giờ trước"
 * < 7 ngày  → "x ngày trước"
 * còn lại   → dd/mm/yyyy
 *
 * `now` chỉ tồn tại để test ghim được mốc thời gian (part-0 §3.4);
 * caller thật bỏ trống.
 */
export const rel = (s: string | Date, now: number = Date.now()): string => {
  const t = s instanceof Date ? s.getTime() : new Date(s).getTime();
  const m = (now - t) / 6e4;
  if (m < 1) return 'vừa xong';
  if (m < 60) return Math.floor(m) + ' phút trước';
  if (m < 1440) return Math.floor(m / 60) + ' giờ trước';
  if (m < 10080) return Math.floor(m / 1440) + ' ngày trước';
  return fmt(s);
};
