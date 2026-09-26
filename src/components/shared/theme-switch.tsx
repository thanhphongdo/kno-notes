'use client';

import type { Theme } from '@/lib/theme';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

const OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'light', label: 'Sáng', icon: 'sun', iconSize: 15 },
  { value: 'dark', label: 'Tối', icon: 'moon', iconSize: 15 },
];

export interface ThemeSwitchProps {
  value: Theme;
  onChange: (theme: Theme) => void;
  className?: string;
}

export function ThemeSwitch({ value, onChange, className }: ThemeSwitchProps) {
  return (
    <Segmented
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Giao diện"
      columns={2}
      className={className}
    />
  );
}
