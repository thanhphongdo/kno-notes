import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HighlightPopup, Prose } from '@/components/shared';
import { useHighlight } from './use-highlight';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

function Harness({ content, disabled = false }: { content: string; disabled?: boolean }) {
  const hl = useHighlight({ noteId: 'n1', content, disabled });
  return (
    <div>
      <Prose
        html={content}
        proseRef={hl.proseRef}
        onClick={hl.onProseClick}
        onMouseUp={hl.onProseSelect}
      />
      <button type="button" data-testid="outside">
        ngoài
      </button>
      <ul data-testid="items">
        {hl.items.map((i) => (
          <li key={i.id}>{i.text}</li>
        ))}
      </ul>
      {hl.popup ? (
        <HighlightPopup
          mode={hl.popup.mode}
          x={hl.popup.x}
          y={hl.popup.y}
          viewportWidth={1200}
          onAction={hl.act}
        />
      ) : null}
    </div>
  );
}

function selectInsideProse(from: number, to: number) {
  const prose = document.querySelector('[data-prose]') as HTMLElement;
  const text = prose.querySelector('p')!.firstChild!;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(prose);
  return prose;
}

function lastFetchBody(): { content: string } {
  const mock = fetch as unknown as ReturnType<typeof vi.fn>;
  const call = mock.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string) as { content: string };
}

describe('useHighlight', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, contentSha: 'sha' }) }),
    );
    window.getSelection()?.removeAllRanges();
  });

  it('lists the highlights already present in the content', () => {
    render(<Harness content={'<p>A <mark data-hl="h1">đoạn quan trọng</mark> B</p>'} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('đoạn quan trọng');
  });

  it('opens the add bubble after a selection and wraps the range on confirm', async () => {
    const user = userEvent.setup();
    render(<Harness content="<p>Adrenalin 0,5 mg tiêm bắp</p>" />);
    const prose = selectInsideProse(0, 9);

    const bubble = await screen.findByRole('button', { name: /Đánh dấu/ });
    expect(document.querySelector('[data-hlpop][data-mode="add"]')).not.toBeNull();

    await user.click(bubble);

    expect(prose.querySelectorAll('mark[data-hl]')).toHaveLength(1);
    expect(prose.querySelector('mark')!.textContent).toBe('Adrenalin');
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/highlights', expect.objectContaining({ method: 'PUT' }));
    expect(lastFetchBody().content).toContain('<mark data-hl=');
    await waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent('Adrenalin'));
  });

  it('persists without creating a version — the only call is the highlights PUT', async () => {
    const user = userEvent.setup();
    render(<Harness content="<p>Adrenalin 0,5 mg tiêm bắp</p>" />);
    selectInsideProse(0, 9);
    await user.click(await screen.findByRole('button', { name: /Đánh dấu/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const mock = fetch as unknown as ReturnType<typeof vi.fn>;
    for (const call of mock.mock.calls) {
      expect(String(call[0])).toBe('/api/notes/n1/highlights');
      expect((call[1] as RequestInit).method).toBe('PUT');
    }
  });

  it('opens the remove bubble on a mark click and unwraps it', async () => {
    const user = userEvent.setup();
    render(<Harness content={'<p>A <mark data-hl="h1">đoạn</mark> B</p>'} />);
    const prose = document.querySelector('[data-prose]') as HTMLElement;
    window.getSelection()!.removeAllRanges();

    fireEvent.click(prose.querySelector('mark')!);
    const bubble = await screen.findByRole('button', { name: /Bỏ đánh dấu/ });
    expect(document.querySelector('[data-hlpop][data-mode="remove"]')).not.toBeNull();

    await user.click(bubble);
    expect(prose.querySelectorAll('mark')).toHaveLength(0);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/notes/n1/highlights',
      expect.objectContaining({ method: 'PUT' }),
    ));
    expect(lastFetchBody().content).not.toContain('<mark');
  });

  it('does nothing at all while an old version is displayed', async () => {
    render(<Harness content={'<p>A <mark data-hl="h1">đoạn</mark> B</p>'} disabled />);
    const prose = document.querySelector('[data-prose]') as HTMLElement;
    fireEvent.click(prose.querySelector('mark')!);
    selectInsideProse(0, 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(document.querySelector('[data-hlpop]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('closes on a mousedown outside the bubble', async () => {
    render(<Harness content="<p>Adrenalin 0,5 mg tiêm bắp</p>" />);
    selectInsideProse(0, 9);
    await screen.findByRole('button', { name: /Đánh dấu/ });
    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(document.querySelector('[data-hlpop]')).toBeNull());
  });

  it('closes on scroll', async () => {
    render(<Harness content="<p>Adrenalin 0,5 mg tiêm bắp</p>" />);
    selectInsideProse(0, 9);
    await screen.findByRole('button', { name: /Đánh dấu/ });
    fireEvent.scroll(window);
    await waitFor(() => expect(document.querySelector('[data-hlpop]')).toBeNull());
  });
});
