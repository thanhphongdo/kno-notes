'use client';

import { Select, type SelectOption } from '@/components/ui/select';

export type SortKey = 'updated' | 'priority' | 'title';

/** Labels verbatim from the prototype's SORTS array. */
export const SORT_OPTIONS: readonly SelectOption<SortKey>[] = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'priority', label: 'Ưu tiên' },
  { value: 'title', label: 'Tên A–Z' },
];

export interface SortSelectProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
  className?: string;
}

export function SortSelect({ value, onChange, className }: SortSelectProps) {
  return (
    <Select
      options={SORT_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Sắp xếp"
      prefixLabel="Sắp xếp"
      align="end"
      offset={42}
      menuMinWidth={200}
      className={className}
    />
  );
}
