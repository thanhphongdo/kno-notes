import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { NoteComment } from '@/lib/types';
import { CommentsSection } from './comments-section';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const comments: NoteComment[] = [
  {
    id: 'c1',
    text: 'Lưu ý bệnh nhân cao tuổi.',
    date: '2026-09-24T09:00:00.000Z',
    author: { id: 'u1', displayName: 'Bác sĩ Lam' },
  },
];

function setup(list: NoteComment[] = comments) {
  return render(
    <ToastProvider>
      <CommentsSection noteId="n1" comments={list} />
    </ToastProvider>,
  );
}

describe('CommentsSection', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ comment: {} }) }),
    );
  });

  it('renders the heading, the count and the existing comments with their real author', () => {
    setup();
    expect(screen.getByText('Bình luận')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Lưu ý bệnh nhân cao tuổi.')).toBeInTheDocument();
    expect(screen.getByText('Bác sĩ Lam')).toBeInTheDocument();
  });

  it('falls back to "?" when a legacy comment has no author', () => {
    setup([{ id: 'c9', text: 'cũ', date: '2026-09-24T09:00:00.000Z' }]);
    expect(screen.getAllByText('?').length).toBeGreaterThan(0);
  });

  it('does not submit an empty or whitespace-only comment', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), '   ');
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits with Ctrl+Enter and clears the draft', async () => {
    const user = userEvent.setup();
    setup();
    const box = screen.getByRole('textbox');
    await user.type(box, 'ghi chú mới');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/comments', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(box).toHaveValue(''));
    expect(refresh).toHaveBeenCalled();
  });

  it('submits with the Gửi button', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'xin chào');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/comments', expect.objectContaining({ method: 'POST' }));
  });

  it('deletes a comment and refreshes', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /^Xoá bình luận/ }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/comments/c1', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
