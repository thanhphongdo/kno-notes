import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('lays the sidebar beside a flexible main column', () => {
    const { container } = render(
      <AppShell sidebar={<aside data-testid="side" />} drawerOpen={false} onDrawerClose={() => {}}>
        <div data-testid="page" />
      </AppShell>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain('min-h-screen');
    expect(screen.getByTestId('side')).toBeInTheDocument();
    expect(container.querySelector('main')?.className).toContain('flex-1');
  });

  it('shows no drawer backdrop while the drawer is closed', () => {
    render(
      <AppShell sidebar={null} drawerOpen={false} onDrawerClose={() => {}}>
        <div />
      </AppShell>,
    );
    expect(screen.queryByTestId('drawer-backdrop')).toBeNull();
  });

  it('closes the drawer when the scrim is clicked', async () => {
    const onDrawerClose = vi.fn();
    render(
      <AppShell sidebar={null} drawerOpen onDrawerClose={onDrawerClose}>
        <div />
      </AppShell>,
    );
    const scrim = screen.getByTestId('drawer-backdrop');
    expect(scrim.className).toContain('bg-[rgba(10,12,14,.45)]');
    expect(scrim.style.zIndex).toBe('40');
    await userEvent.click(scrim);
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
  });
});
