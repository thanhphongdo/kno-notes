import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPopover } from './settings-popover';

function renderPopover(overrides: Partial<ComponentProps<typeof SettingsPopover>> = {}) {
  const props: ComponentProps<typeof SettingsPopover> = {
    open: true,
    onOpenChange: vi.fn(),
    theme: 'light',
    onThemeChange: vi.fn(),
    fontSize: 17,
    onFontSizeChange: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<SettingsPopover {...props} />);
  return props;
}

describe('SettingsPopover', () => {
  it('renders the Aa trigger with serif A and a small a', () => {
    renderPopover({ open: false });
    const trigger = screen.getByRole('button', { name: 'Giao diện' });
    expect(trigger).toHaveTextContent('Aa');
    expect(trigger.className).toContain('h-40');
    expect(trigger.className).toContain('rounded-10');
  });

  it('shows nothing until opened', () => {
    renderPopover({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is 288px wide with a 14px radius when open', () => {
    renderPopover();
    const panel = screen.getByRole('dialog', { name: 'Giao diện' });
    expect(panel.style.width).toBe('288px');
    expect(panel.className).toContain('rounded-14');
  });

  it('contains the theme switch, the font size control and logout', () => {
    renderPopover();
    expect(screen.getByRole('radiogroup', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Cỡ chữ nội dung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('relays theme, font-size and logout', async () => {
    const onThemeChange = vi.fn();
    const onLogout = vi.fn();
    renderPopover({ onThemeChange, onLogout });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    renderPopover({ onOpenChange });
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
