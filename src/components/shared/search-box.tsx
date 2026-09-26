'use client';

import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';

export const SEARCH_PLACEHOLDER = 'Tìm theo tiêu đề, mô tả hoặc #thẻ';

export interface SearchBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `<SearchSuggestions/>`. */
  suggestions: ReactNode;
  /** `!value && !isMobile`. */
  showKbdHint: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  className?: string;
}

/**
 * Box: h42 · px 12 · gap 10 · r10 · --surface · 1px --line → --accent when open · z32.
 * Backdrop z31. Panel z33 at top 48.
 */
export function SearchBox({
  value, onValueChange, onSubmit, open, onOpenChange, suggestions,
  showKbdHint, inputRef, placeholder = SEARCH_PLACEHOLDER, className,
}: SearchBoxProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      {open ? (
        <div
          data-testid="search-backdrop"
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0"
          style={{ zIndex: Z.sugBackdrop }}
        />
      ) : null}

      <div
        data-search-box=""
        className={cn(
          'relative flex h-42 items-center gap-10 rounded-10 border bg-surface px-12',
          open ? 'border-accent' : 'border-line',
        )}
        style={{ zIndex: Z.sugBox }}
      >
        <Icon name="search" size={17} className="text-faint" />
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => onOpenChange(true)}
          onClick={() => onOpenChange(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              onOpenChange(false);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-14 text-text outline-none placeholder:text-faint"
        />
        {value ? (
          <IconButton
            icon="close"
            label="Xoá từ khoá"
            variant="soft"
            size={24}
            radius="6"
            iconSize={12}
            strokeWidth={2.2}
            tone="muted"
            onClick={() => onValueChange('')}
          />
        ) : null}
        {showKbdHint ? <Kbd>/</Kbd> : null}
      </div>

      {open ? (
        <div
          className="absolute inset-x-0 top-48 flex flex-col gap-6 rounded-12 border border-line bg-surface p-8 shadow-card"
          style={{ zIndex: Z.sugPanel, maxHeight: 'min(480px, 72vh)', overflowY: 'auto' }}
        >
          {suggestions}
        </div>
      ) : null}
    </div>
  );
}
