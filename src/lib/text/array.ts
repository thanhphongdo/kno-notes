// src/lib/text/array.ts

/** Fisher-Yates — port nguyên văn từ prototype, không sửa mảng gốc. */
export const shuffle = <T>(a: readonly T[]): T[] => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
