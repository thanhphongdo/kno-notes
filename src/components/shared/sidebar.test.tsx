import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, BRAND_MARK, Sidebar } from './sidebar';
import { SidebarNavItem } from './sidebar-nav-item';

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    collapsed: false,
    drawerOpen: false,
    isMobile: false,
    onCollapse: vi.fn(),
    user: { displayName: 'Bác sĩ', username: 'bacsi' },
    onLogout: vi.fn(),
    children: <SidebarNavItem label="Tất cả ghi chú" count={14} active onClick={() => {}} />,
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe('Sidebar', () => {
  it('shows the Kno-Notes brand with the K mark', () => {
    renderSidebar();
    expect(APP_NAME).toBe('Kno-Notes');
    expect(BRAND_MARK).toBe('K');
    expect(screen.getByText('Kno-Notes')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('is 256px wide with a right hairline', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen={false} isMobile={false} onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-256');
    expect(aside.className).toContain('border-r');
    expect(aside.className).toContain('border-line');
    expect(aside.className).toContain('gap-28');
  });

  it('collapses on desktop with -256px margin and hidden visibility', () => {
    const { container } = render(
      <Sidebar collapsed drawerOpen={false} isMobile={false} onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.marginLeft).toBe('-256px');
    expect(aside.style.visibility).toBe('hidden');
    expect(aside.style.transform).toBe('none');
  });

  it('slides off-canvas on mobile when the drawer is closed', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen={false} isMobile onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.transform).toBe('translateX(-102%)');
    expect(aside.style.visibility).toBe('hidden');
    expect(aside.style.position).toBe('fixed');
  });

  it('shows the drawer on mobile when open', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen isMobile onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.transform).toBe('none');
    expect(aside.style.visibility).toBe('visible');
  });

  it('fires onCollapse from the 34px collapse button', async () => {
    const onCollapse = vi.fn();
    renderSidebar({ onCollapse });
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('shows the session display name, mono username and initials', () => {
    renderSidebar({ user: { displayName: 'Nguyễn An', username: 'annguyen' } });
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('annguyen').className).toContain('font-mono');
    // Word initials, like the prototype's BS for "Bác sĩ" — not the first
    // two characters, which would read "NG".
    expect(screen.getByText('NA')).toBeInTheDocument();
  });

  it('fires onLogout', async () => {
    const onLogout = vi.fn();
    renderSidebar({ onLogout });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('SidebarNavItem', () => {
  it('marks the active item and shows a mono count', () => {
    render(<SidebarNavItem label="Tất cả ghi chú" count={14} active onClick={() => {}} />);
    const item = screen.getByRole('button', { name: /Tất cả ghi chú/ });
    expect(item).toHaveAttribute('aria-current', 'page');
    expect(item.className).toContain('h-38');
    expect(screen.getByText('14').className).toContain('font-mono');
  });

  it('uses h34 for a priority row and h32 for a tag row', () => {
    const { rerender } = render(
      <SidebarNavItem label="Cao" variant="priority" dotClassName="bg-hi" onClick={() => {}} />,
    );
    expect(screen.getByRole('button').className).toContain('h-34');
    rerender(<SidebarNavItem label="Cấp cứu" variant="tag" hash onClick={() => {}} />);
    expect(screen.getByRole('button').className).toContain('h-32');
    expect(screen.getByText('#').className).toContain('font-mono');
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<SidebarNavItem label="Yêu thích" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
