'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

export const HEADER_PAD_X = { desktop: 40, mobile: 16 } as const;

export interface AppHeaderProps {
  /** `isMobile || sidebarCollapsed`. */
  showMenuButton: boolean;
  onMenuClick: () => void;
  /** `<SearchBox/>`. */
  search: ReactNode;
  /** `<SettingsPopover/>`. */
  settings: ReactNode;
  onNewNote: () => void;
  isMobile: boolean;
  className?: string;
}

/** h64 · sticky top 0 · z30 · gap 10 · bg --bg · border-bottom 1px --line. */
export function AppHeader({
  showMenuButton, onMenuClick, search, settings, onNewNote, isMobile, className,
}: AppHeaderProps) {
  const padX = isMobile ? HEADER_PAD_X.mobile : HEADER_PAD_X.desktop;

  return (
    <header
      className={cn('sticky top-0 flex h-64 items-center gap-10 border-b border-line bg-bg', className)}
      style={{ zIndex: Z.header, paddingLeft: padX, paddingRight: padX }}
    >
      {showMenuButton ? (
        <IconButton
          icon="sidebar-open"
          label="Mở thanh bên"
          size={40}
          radius="10"
          iconSize={20}
          tone="default"
          onClick={onMenuClick}
        />
      ) : null}

      <div className="relative min-w-0 max-w-560 flex-1">{search}</div>

      <div className="ml-auto flex-[0_1_auto]" />

      {settings}

      <Button
        variant="primary"
        size="40"
        icon="plus"
        iconSize={17}
        onClick={onNewNote}
        aria-label="Ghi chú mới"
        className={cn('shrink-0 gap-8', isMobile && 'px-11')}
      >
        {isMobile ? null : 'Ghi chú mới'}
      </Button>
    </header>
  );
}
