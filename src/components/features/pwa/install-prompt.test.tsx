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

  it('puts the download icon on the install button', () => {
    render(<InstallPrompt />);
    firePrompt();
    expect(screen.getByRole('button', { name: 'Cài đặt' }).querySelector('svg')).not.toBeNull();
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

describe('InstallPrompt on iOS, where beforeinstallprompt never fires', () => {
  function setUserAgent(value: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
  }

  const realUserAgent = window.navigator.userAgent;
  afterEach(() => setUserAgent(realUserAgent));

  it('tells iPhone Safari how to add the app to the Home Screen', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    );
    render(<InstallPrompt />);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-install-prompt', 'ios-safari');
    expect(screen.getByText(/Thêm vào Màn hình chính/)).toBeInTheDocument();
    // A button that cannot work must not be offered.
    expect(screen.queryByRole('button', { name: 'Cài đặt' })).toBeNull();
  });

  it('sends other iOS browsers to Safari, which is the only one that can install', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
    );
    render(<InstallPrompt />);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-install-prompt', 'ios-other-browser');
    expect(screen.getByText(/mở trang này bằng Safari/)).toBeInTheDocument();
  });
});
