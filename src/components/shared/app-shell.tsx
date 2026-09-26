'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';

export interface AppShellProps {
  sidebar: ReactNode;
  /** `<AppHeader/>` followed by the page container. */
  children: ReactNode;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  className?: string;
}

/** Outer frame: min-h-screen flex, drawer backdrop rgba(10,12,14,.45) at z40. */
export function AppShell({ sidebar, children, drawerOpen, onDrawerClose, className }: AppShellProps) {
  return (
    <div className={cn('flex min-h-screen bg-bg text-text', className)}>
      {drawerOpen ? (
        <div
          data-testid="drawer-backdrop"
          aria-hidden="true"
          onClick={onDrawerClose}
          className="fixed inset-0 bg-[rgba(10,12,14,.45)]"
          style={{ zIndex: Z.drawerBackdrop }}
        />
      ) : null}
      {sidebar}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
