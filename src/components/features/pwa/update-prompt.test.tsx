import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UPDATE_ACTION, UPDATE_MESSAGE, UpdatePrompt } from './update-prompt';

describe('UpdatePrompt', () => {
  it('shows nothing while the running version is the newest one', () => {
    const { container } = render(<UpdatePrompt update={{ ready: false, apply: vi.fn() }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces a new build and reloads on demand', async () => {
    const apply = vi.fn();
    const user = userEvent.setup();
    render(<UpdatePrompt update={{ ready: true, apply }} />);

    expect(screen.getByText(UPDATE_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: UPDATE_ACTION }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('never reloads on its own', () => {
    const apply = vi.fn();
    render(<UpdatePrompt update={{ ready: true, apply }} />);
    expect(apply).not.toHaveBeenCalled();
  });

  it('carries the hook e2e uses to find it', () => {
    const { container } = render(<UpdatePrompt update={{ ready: true, apply: vi.fn() }} />);
    expect(container.querySelector('[data-update-prompt="ready"]')).not.toBeNull();
  });
});
