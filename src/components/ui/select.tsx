'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from './icon';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Muted text before the value, e.g. "Sắp xếp". */
  prefixLabel?: string;
  align?: 'start' | 'end';
  menuMinWidth?: number;
  offset?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Custom listbox. SPEC §1.2 #16 forbids a native <select> anywhere in the app.
 * Trigger: h36, pl-12 pr-10, 1px --line, r9, --surface, 13px, gap 8.
 * Menu: top 42, min-width 200, p-6, r12, shadow, items h36 px-10 r8.
 */
export function Select<T extends string = string>({
  options, value, onChange, ariaLabel, prefixLabel,
  align = 'end', menuMinWidth = 200, offset = 42, disabled = false, className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close(true);
    },
    [options, onChange, close],
  );

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="flex h-36 items-center gap-8 rounded-9 border border-line bg-surface pl-12 pr-10 text-13 text-text transition-colors duration-150 hover:border-line2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {prefixLabel ? <span className="text-faint">{prefixLabel}</span> : null}
        <span className="font-medium">{current?.label ?? ''}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn('text-faint transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <>
          <div
            data-testid="select-backdrop"
            aria-hidden="true"
            onClick={() => close(false)}
            className="fixed inset-0"
            style={{ zIndex: Z.sortBackdrop }}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              'absolute m-0 flex list-none flex-col gap-2 rounded-12 border border-line bg-surface p-6 shadow-card',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            style={{ top: offset, minWidth: menuMinWidth, zIndex: Z.sortMenu }}
          >
            {options.map((opt, i) => {
              const selected = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    id={`${listId}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(i)}
                    className={cn(
                      'flex h-36 w-full items-center justify-between gap-12 rounded-8 border-0 px-10 text-left text-13 text-text',
                      selected ? 'bg-surface2 font-medium' : 'bg-transparent font-normal',
                      i === activeIndex && !selected && 'bg-surface2',
                      'hover:bg-surface2 disabled:opacity-40',
                    )}
                  >
                    <span>{opt.label}</span>
                    <Icon name="check" size={14} className={cn('text-accent', selected ? 'opacity-100' : 'opacity-0')} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
