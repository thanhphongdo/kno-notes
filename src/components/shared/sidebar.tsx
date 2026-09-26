'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';

export const APP_NAME = 'Kno-Notes';
export const BRAND_MARK = 'K';

export interface SidebarUser {
  displayName: string;
  username: string;
}

export interface SidebarProps {
  /** Desktop collapse: margin-left -256px + visibility hidden. */
  collapsed: boolean;
  /** Mobile drawer: translateX(0) vs translateX(-102%). */
  drawerOpen: boolean;
  isMobile: boolean;
  onCollapse: () => void;
  onBrandClick?: () => void;
  user: SidebarUser;
  onLogout: () => void;
  /** SidebarSection groups, in order. */
  children: ReactNode;
  className?: string;
}

/**
 * w 256 · h 100vh · sticky (desktop) / fixed (mobile) · z 50
 * padding 22 16 16 · gap 28 · transition transform/margin-left/visibility .22s
 */
export function Sidebar({
  collapsed, drawerOpen, isMobile, onCollapse, onBrandClick, user, onLogout, children, className,
}: SidebarProps) {
  const hidden = isMobile ? !drawerOpen : collapsed;

  return (
    <aside
      className={cn(
        'flex h-screen w-256 shrink-0 flex-col gap-28 overflow-y-auto border-r border-line bg-bg pt-22 pr-16 pb-16 pl-16',
        '[transition:transform_.22s_ease,margin-left_.22s_ease,visibility_.22s]',
        className,
      )}
      style={{
        position: isMobile ? 'fixed' : 'sticky',
        top: 0,
        left: 0,
        zIndex: Z.sidebar,
        transform: isMobile && !drawerOpen ? 'translateX(-102%)' : 'none',
        marginLeft: !isMobile && collapsed ? '-256px' : '0px',
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      <div className="flex items-center justify-between px-8">
        <button
          type="button"
          onClick={onBrandClick}
          className="flex cursor-pointer items-center gap-10 border-0 bg-transparent p-0 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-28 w-28 items-center justify-center rounded-8 bg-accent font-serif text-16 font-bold text-accent-ink"
          >
            {BRAND_MARK}
          </span>
          <span className="font-serif text-18 font-semibold tracking-[-.01em] text-text">{APP_NAME}</span>
        </button>
        <IconButton
          icon="sidebar-collapse"
          label="Thu gọn thanh bên"
          size={34}
          radius="8"
          iconSize={18}
          tone="muted"
          hoverTone="text"
          onClick={onCollapse}
        />
      </div>

      {children}

      <div className="flex items-center gap-10 border-t border-line px-10 pt-12">
        <Avatar name={user.displayName} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-13 font-medium">{user.displayName}</span>
          <span className="truncate font-mono text-12 text-faint">{user.username}</span>
        </div>
        <IconButton
          icon="logout"
          label="Đăng xuất"
          size={34}
          radius="8"
          iconSize={17}
          tone="muted"
          onClick={onLogout}
        />
      </div>
    </aside>
  );
}
