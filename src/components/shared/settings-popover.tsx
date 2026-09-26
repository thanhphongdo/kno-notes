'use client';

import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { FontSizeControl } from './font-size-control';
import { ThemeSwitch } from './theme-switch';

export interface SettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onLogout: () => void;
  className?: string;
}

/** Trigger h40 min-w40 px-10 r10 1px --line, Serif 17/600 "A" + 12 "a". Panel 288 r14 p18 gap 20. */
export function SettingsPopover({
  open, onOpenChange, theme, onThemeChange, fontSize, onFontSizeChange, onLogout, className,
}: SettingsPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      offset={48}
      width={288}
      backdropZ={Z.settingsBackdrop}
      panelZ={Z.settingsPopover}
      panelLabel="Giao diện"
      panelClassName="rounded-14 flex flex-col gap-20 p-18"
      wrapperClassName={cn('shrink-0', className)}
      trigger={
        <button
          type="button"
          title="Giao diện"
          aria-label="Giao diện"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex h-40 min-w-40 items-center justify-center gap-2 rounded-10 border border-line bg-surface px-10 font-serif text-17 font-semibold text-text transition-colors duration-150 hover:border-line2"
        >
          A<span className="text-12">a</span>
        </button>
      }
    >
      <div className="flex flex-col gap-10">
        <div className="text-12 font-medium text-muted">Giao diện</div>
        <ThemeSwitch value={theme} onChange={onThemeChange} />
      </div>

      <FontSizeControl value={fontSize} onChange={onFontSizeChange} />

      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-8 border-0 border-t border-line bg-transparent pt-14 text-13 text-muted hover:text-text"
      >
        <Icon name="logout" size={15} />
        Đăng xuất
      </button>
    </Popover>
  );
}
