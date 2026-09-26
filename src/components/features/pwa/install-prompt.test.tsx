import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_DISMISS_KEY, InstallPrompt } from './install-prompt';

interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function firePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as PromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome });
  act(() => { window.dispatchEvent(event); });
  return prompt;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stays hidden until the browser offers an install', () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
    firePrompt();
    expect(screen.getByRole('dialog', { name: 'Cài đặt ứng dụng' })).toBeInTheDocument();
  });

  it('shows the install prompt and hides it once the browser answers', async () => {
    const user = userEvent.setup();
    render(<InstallPrompt />);
    const prompt = firePrompt();

    await user.click(screen.getByRole('button', { name: 'Cài đặt' }));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('remembers a dismissal and never asks again', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstallPrompt />);
    firePrompt();

    await user.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(INSTALL_DISMISS_KEY)).toBe('1');

    unmount();
    render(<InstallPrompt />);
    firePrompt();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders when storage throws instead of crashing the page', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => render(<InstallPrompt />)).not.toThrow();
    firePrompt();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
