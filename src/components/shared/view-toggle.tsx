'use client';

import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

export type ViewMode = 'grid' | 'list';

const OPTIONS: readonly SegmentedOption<ViewMode>[] = [
  { value: 'grid', icon: 'grid', iconSize: 15, title: 'Dạng lưới' },
  { value: 'list', icon: 'list', iconSize: 15, title: 'Dạng danh sách' },
];

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <Segmented
      variant="bordered"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Hiển thị"
      className={className}
    />
  );
}
