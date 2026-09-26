import { describe, it, expect } from 'vitest';
import { norm } from './normalize';

describe('norm', () => {
  it('strips Vietnamese tone marks and lowercases', () => {
    expect(norm('Sổ')).toBe('so');
    expect(norm('Đọc')).toBe('doc');
    expect(norm('ưu tiên')).toBe('uu tien');
  });

  it('maps đ/Đ to d in every position', () => {
    expect(norm('Đại dương đỏ')).toBe('dai duong do');
    expect(norm('ĐỌC ECG')).toBe('doc ecg');
  });

  it('is idempotent', () => {
    const once = norm('Xử trí cấp cứu sốc phản vệ');
    expect(norm(once)).toBe(once);
    expect(once).toBe('xu tri cap cuu soc phan ve');
  });

  it('leaves ASCII, digits and punctuation untouched', () => {
    expect(norm('Paracetamol 10–15 mg/kg')).toBe('paracetamol 10–15 mg/kg');
  });

  it('handles the empty string', () => {
    expect(norm('')).toBe('');
  });
});
