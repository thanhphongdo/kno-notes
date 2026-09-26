'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';
import { Z } from '@/lib/z';

export function TooltipRoot({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * The prototype uses the native `title` attribute almost everywhere — IconButton
 * already does that. Use this only where a styled, delayed tooltip is required.
 */
export function Tooltip({ content, children, side = 'top', delayDuration }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          style={{ zIndex: Z.toast }}
          className="rounded-8 bg-text px-10 py-6 text-12 text-bg shadow-card"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
