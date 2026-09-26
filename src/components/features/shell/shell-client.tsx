'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVerifiedNavigate } from '@/lib/nav/navigate';
import {
  AppHeader, AppShell, PRIORITIES, PRIORITY_CLASS, PRIORITY_LABEL,
  SettingsPopover, Sidebar, SidebarNavItem, SidebarSection,
} from '@/components/shared';
import { usePrefs } from '@/hooks/use-prefs';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNoteFilters } from '@/hooks/use-note-filters';
import { useTheme } from '@/components/providers/theme-provider';
import { loginPath, newNotePath } from '@/lib/nav/paths';
import type { FilterPatch } from '@/lib/nav/filters';
import type { ShellNavData } from './shell-data';
import { KeyboardLayer } from './keyboard-layer';
import { SearchContainer } from './search-container';

export type { ShellNavData } from './shell-data';

/**
 * Chrome for every page behind the session cookie: sidebar, header, settings
 * popover and the shell's keyboard shortcuts.
 *
 * It owns state, not markup — every visual element comes from
 * `@/components/shared`. Two behaviours are worth stating explicitly:
 *
 *  • Collapse means two different things. On desktop the sidebar collapses to
 *    a persisted pref; on mobile it is a drawer whose state is transient and
 *    must not follow the user back to their laptop. `useIsMobile()` picks.
 *  • `SidebarNavItem` takes `onClick`, not `href` (contracts §2.1), so each
 *    item navigates through `useNoteFilters`, which MERGES the patch into the
 *    filters already in the URL. Thẻ và mức ưu tiên vì thế lọc được cùng lúc;
 *    bấm lại đúng mục đang bật thì chỉ tắt mục đó. "Tất cả ghi chú" là nút duy
 *    nhất xoá sạch.
 */
export function ShellClient({ data, children }: { data: ShellNavData; children: ReactNode }) {
  const router = useRouter();
  const navigate = useVerifiedNavigate();
  const params = useSearchParams();
  const { setFilters, clearAll } = useNoteFilters();
  const isMobile = useIsMobile();
  const { prefs, setPrefs } = usePrefs();
  const { theme, setTheme, fontSize, setFontSize } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);

  const activeTag = params.get('tag');
  const activePriority = params.get('priority');
  const activeFav = params.get('fav') === '1';
  const hasQuery = Boolean(params.get('q'));
  const onDashboardRoot = !activeFav && !activePriority && !activeTag && !hasQuery;

  /** Áp một mặt lọc, giữ nguyên những mặt đang bật. */
  const applyFilter = useCallback(
    (patch: FilterPatch) => {
      setDrawerOpen(false);
      setFilters(patch, { scroll: true });
    },
    [setFilters],
  );

  const showAll = useCallback(() => {
    setDrawerOpen(false);
    clearAll({ scroll: true });
  }, [clearAll]);

  /** Điều hướng thẳng (logo, "Ghi chú mới", đăng xuất) — không phải bộ lọc. */
  const go = useCallback(
    (href: string) => {
      setDrawerOpen(false);
      navigate(href, 'push', { scroll: true });
    },
    [navigate],
  );

  const openSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen(true);
    else setPrefs({ sidebarCollapsed: false });
  }, [isMobile, setPrefs]);

  const collapseSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen(false);
    else setPrefs({ sidebarCollapsed: true });
  }, [isMobile, setPrefs]);

  const closeOverlays = useCallback(() => {
    setDrawerOpen(false);
    setSettingsOpen(false);
    setSearchOpen(false);
  }, []);

  const focusSearch = useCallback(() => {
    searchInput.current?.focus();
    setSearchOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* the cookie may already be gone; send them to /login either way */
    }
    navigate(loginPath(), 'replace');
    router.refresh();
  }, [navigate, router]);

  const sidebar = (
    <Sidebar
      collapsed={prefs.sidebarCollapsed}
      drawerOpen={drawerOpen}
      isMobile={isMobile}
      onCollapse={collapseSidebar}
      onBrandClick={showAll}
      user={data.user}
      onLogout={logout}
    >
      <SidebarSection>
        <SidebarNavItem
          label="Tất cả ghi chú"
          count={data.counts.all}
          active={onDashboardRoot}
          onClick={showAll}
        />
        <SidebarNavItem
          label="Yêu thích"
          count={data.counts.favorite}
          active={activeFav}
          onClick={() => applyFilter({ fav: !activeFav })}
        />
      </SidebarSection>

      <SidebarSection label="Mức ưu tiên">
        {PRIORITIES.map((priority) => (
          <SidebarNavItem
            key={priority}
            variant="priority"
            label={PRIORITY_LABEL[priority]}
            count={data.counts[priority]}
            dotClassName={PRIORITY_CLASS[priority].dot}
            active={activePriority === priority}
            onClick={() => applyFilter({ priority: activePriority === priority ? null : priority })}
          />
        ))}
      </SidebarSection>

      <SidebarSection label="Thẻ" scroll>
        {data.tags.map((tag) => (
          <SidebarNavItem
            key={tag.slug}
            variant="tag"
            hash
            label={tag.name}
            count={tag.count}
            active={activeTag === tag.name}
            onClick={() => applyFilter({ tag: activeTag === tag.name ? null : tag.name })}
          />
        ))}
      </SidebarSection>
    </Sidebar>
  );

  return (
    <>
      <KeyboardLayer onFocusSearch={focusSearch} onCloseOverlays={closeOverlays} />
      <AppShell sidebar={sidebar} drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)}>
        <AppHeader
          showMenuButton={isMobile || prefs.sidebarCollapsed}
          onMenuClick={openSidebar}
          isMobile={isMobile}
          onNewNote={() => go(newNotePath())}
          search={
            <SearchContainer
              tags={data.tags}
              isMobile={isMobile}
              inputRef={searchInput}
              open={searchOpen}
              onOpenChange={setSearchOpen}
            />
          }
          settings={
            <SettingsPopover
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              theme={theme}
              onThemeChange={setTheme}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              onLogout={logout}
            />
          }
        />
        {children}
      </AppShell>
    </>
  );
}
