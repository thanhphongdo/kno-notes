'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  /** `start` = left-0, `end` = right-0. */
  align?: 'start' | 'end';
  /** Panel `top` in px. */
  offset?: number;
  width?: number;
  minWidth?: number;
  panelClassName?: string;
  backdropZ: number;
  panelZ: number;
  panelLabel: string;
  wrapperClassName?: string;
}

/**
 * The prototype's popover pattern: a full-screen transparent click-catcher at
 * `backdropZ` plus an absolutely positioned panel at `panelZ`, both inside a
 * `relative` wrapper. Escape closes. Radix is deliberately not used here — it
 * portals to <body> and positions with floating-ui, which cannot reproduce the
 * prototype's exact `top: 48px; right: 0` offsets and z-index pairs.
 */
export function Popover({
  open, onOpenChange, trigger, children, align = 'end', offset = 48,
  width, minWidth, panelClassName, backdropZ, panelZ, panelLabel, wrapperClassName,
}: PopoverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <div className={cn('relative', wrapperClassName)}>
      {trigger}
      {open ? (
        <>
          <div
            data-testid="popover-backdrop"
            aria-hidden="true"
            onClick={() => onOpenChange(false)}
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
          />
          <div
            role="dialog"
            aria-label={panelLabel}
            className={cn(
              'absolute rounded-12 border border-line bg-surface shadow-card',
              align === 'end' ? 'right-0' : 'left-0',
              panelClassName,
            )}
            style={{ top: offset, zIndex: panelZ, width, minWidth }}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
