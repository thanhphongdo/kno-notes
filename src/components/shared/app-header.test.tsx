import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';

function renderHeader(overrides: Partial<ComponentProps<typeof AppHeader>> = {}) {
  const props: ComponentProps<typeof AppHeader> = {
    showMenuButton: false,
    onMenuClick: vi.fn(),
    search: <div data-testid="search" />,
    settings: <div data-testid="settings" />,
    onNewNote: vi.fn(),
    isMobile: false,
    ...overrides,
  };
  render(<AppHeader {...props} />);
  return props;
}

describe('AppHeader', () => {
  it('is 64px tall, sticky, with a bottom hairline and 40px side padding on desktop', () => {
    const { container } = render(
      <AppHeader showMenuButton={false} onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile={false} />,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('h-64');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('border-b');
    expect(header.className).toContain('border-line');
    expect(header.style.paddingLeft).toBe('40px');
    expect(header.style.paddingRight).toBe('40px');
  });

  it('uses 16px side padding on mobile', () => {
    const { container } = render(
      <AppHeader showMenuButton onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile />,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.style.paddingLeft).toBe('16px');
  });

  it('hides the menu button unless asked for', () => {
    renderHeader({ showMenuButton: false });
    expect(screen.queryByRole('button', { name: 'Mở thanh bên' })).toBeNull();
  });

  it('shows and fires the menu button', async () => {
    const onMenuClick = vi.fn();
    renderHeader({ showMenuButton: true, onMenuClick });
    await userEvent.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('renders the search and settings slots', () => {
    renderHeader();
    expect(screen.getByTestId('search')).toBeInTheDocument();
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('shows the "Ghi chú mới" label on desktop and hides it on mobile', () => {
    const { rerender } = render(
      <AppHeader showMenuButton={false} onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile={false} />,
    );
    expect(screen.getByRole('button', { name: 'Ghi chú mới' })).toHaveTextContent('Ghi chú mới');
    rerender(
      <AppHeader showMenuButton onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile />,
    );
    expect(screen.getByRole('button', { name: 'Ghi chú mới' })).not.toHaveTextContent('Ghi chú mới');
  });

  it('fires onNewNote', async () => {
    const onNewNote = vi.fn();
    renderHeader({ onNewNote });
    await userEvent.click(screen.getByRole('button', { name: 'Ghi chú mới' }));
    expect(onNewNote).toHaveBeenCalledTimes(1);
  });
});
