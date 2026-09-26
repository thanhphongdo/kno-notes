'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

export interface FilterChipDescriptor {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface FilterChipsProps {
  chips: readonly FilterChipDescriptor[];
  onClearAll: () => void;
  className?: string;
}

export function FilterChips({ chips, onClearAll, className }: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-8', className)}>
      {chips.map((chip) => (
        <Chip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <Button variant="link" size="30" onClick={onClearAll} className="px-6">
        Xoá bộ lọc
      </Button>
    </div>
  );
}
