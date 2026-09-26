import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Prose } from './prose';

/**
 * Regression guard for a P0: React re-applies `dangerouslySetInnerHTML` when
 * the wrapper object's identity changes, replacing every child of the prose
 * surface. That destroyed the live Range the highlight feature holds between
 * "select text" and "click Đánh dấu", so highlighting silently did nothing in
 * a real browser.
 *
 * The invariant that matters is that an unrelated parent re-render must not
 * re-render Prose at all. jsdom will not reproduce the innerHTML rewrite, so
 * asserting on the DOM would pass either way — we assert the render itself.
 */
describe('Prose is insulated from unrelated parent re-renders', () => {
  it('does not re-render when the parent re-renders with the same html', async () => {
    const user = userEvent.setup();
    const html = '<p>Adrenalin 0,5 mg tiêm bắp.</p>';
    const onRender = vi.fn();

    function Probe({ html: h }: { html: string }) {
      onRender();
      return <Prose html={h} />;
    }
    const MemoedProbe = Prose; // keep the import meaningful for the assertion below

    function Parent() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN((v) => v + 1)}>bump {n}</button>
          <MemoedProbe html={html} />
          <Probe html={html} />
        </>
      );
    }

    render(<Parent />);
    expect(onRender).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /bump/ }));
    await user.click(screen.getByRole('button', { name: /bump/ }));

    // The unmemoized Probe re-renders with the parent; Prose must not.
    expect(onRender).toHaveBeenCalledTimes(3);
    expect(
      (Prose as unknown as { $$typeof?: symbol }).$$typeof,
      'Prose must stay wrapped in React.memo',
    ).toBe(Symbol.for('react.memo'));
  });

  it('keeps a stable dangerouslySetInnerHTML object across renders of the same html', () => {
    const html = '<p>x</p>';
    const { container, rerender } = render(<Prose html={html} className="a" />);
    const root = container.querySelector('[data-prose]') as HTMLElement;

    const mark = document.createElement('mark');
    mark.dataset.hl = 'manual';
    root.appendChild(mark);

    rerender(<Prose html={html} className="b" />);

    expect(root.querySelector('mark[data-hl="manual"]')).not.toBeNull();
    expect(root.className).toBe('b');
  });
});
