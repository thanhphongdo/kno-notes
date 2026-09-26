import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { EditorDraft } from '@/hooks/use-note-editor';
import { EditorClient } from './editor-client';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
}));

const newDraft: EditorDraft = {
  id: null, title: '', desc: '', tags: [], priority: 'medium', images: [], content: '', changeNote: '',
};
const editDraft: EditorDraft = {
  ...newDraft,
  id: 'n1',
  title: 'Cũ',
  desc: 'mô tả cũ',
  tags: ['Cấp cứu'],
  priority: 'high',
  images: [{ id: 'i1', label: 'a.png', src: '/api/images/u/i1' }],
  content: '<p>x</p>',
};

function setup(draft: EditorDraft, nextVersion: number, allTags: string[] = []) {
  return render(
    <ToastProvider>
      <EditorClient draft={draft} nextVersion={nextVersion} allTags={allTags} />
    </ToastProvider>,
  );
}

function lastBody(): Record<string, unknown> {
  const mock = fetch as unknown as ReturnType<typeof vi.fn>;
  const init = mock.mock.calls.at(-1)![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('EditorClient', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    vi.unstubAllGlobals();
  });

  it('labels the save button with the version that will be created', () => {
    setup(newDraft, 1);
    expect(screen.getByRole('button', { name: 'Lưu v1' })).toBeInTheDocument();
    expect(screen.getByText('Ghi chú mới sẽ bắt đầu từ phiên bản v1.')).toBeInTheDocument();
  });

  it('shows the existing note heading and the version hint', () => {
    setup(editDraft, 2);
    expect(screen.getByRole('button', { name: 'Lưu v2' })).toBeInTheDocument();
    expect(screen.getByText('Chỉnh sửa ghi chú')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nội dung thay đổi sẽ được lưu thành phiên bản v2; các bản cũ vẫn xem và khôi phục được.',
      ),
    ).toBeInTheDocument();
  });

  it('POSTs a new note and toasts the version the server reports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ note: { id: 'n9' }, version: 1 }) }),
    );
    const user = userEvent.setup();
    setup(newDraft, 1);
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Ghi chú mới');
    await user.click(screen.getByRole('button', { name: 'Lưu v1' }));

    expect(fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' }));
    expect(lastBody().title).toBe('Ghi chú mới');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/notes/n9'));
    expect(await screen.findByText('Đã lưu · phiên bản v1')).toBeInTheDocument();
  });

  it('PATCHes the complete note body — a partial payload would wipe fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ note: { id: 'n1' }, version: 2 }) }),
    );
    const user = userEvent.setup();
    setup(editDraft, 2);
    await user.click(screen.getByRole('button', { name: 'Lưu v2' }));

    expect(fetch).toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'PATCH' }));
    expect(lastBody()).toEqual({
      title: 'Cũ',
      desc: 'mô tả cũ',
      tags: ['Cấp cứu'],
      priority: 'high',
      content: '<p>x</p>',
      images: [{ id: 'i1', label: 'a.png', src: '/api/images/u/i1' }],
      changeNote: '',
    });
    expect(await screen.findByText('Đã lưu · phiên bản v2')).toBeInTheDocument();
  });

  it('uses the server version, not the optimistic one, when nothing changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ note: { id: 'n1' }, version: 1 }) }),
    );
    const user = userEvent.setup();
    setup(editDraft, 2);
    await user.click(screen.getByRole('button', { name: 'Lưu v2' }));
    expect(await screen.findByText('Đã lưu · phiên bản v1')).toBeInTheDocument();
  });

  it('keeps the user on the page and toasts when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const user = userEvent.setup();
    setup(editDraft, 2);
    await user.click(screen.getByRole('button', { name: 'Lưu v2' }));
    expect(await screen.findByText('Không lưu được ghi chú')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('cancels to the detail page for an existing note and to the dashboard for a new one', async () => {
    const user = userEvent.setup();
    const { unmount } = setup(editDraft, 2);
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(push).toHaveBeenCalledWith('/notes/n1');

    unmount();
    push.mockClear();
    setup(newDraft, 1);
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('offers the other tags as suggestions and adds one on click', async () => {
    const user = userEvent.setup();
    setup(editDraft, 2, ['Cấp cứu', 'Tim mạch']);
    // "Cấp cứu" is already on the note, so only "Tim mạch" is offered.
    expect(screen.queryByRole('button', { name: '+ Cấp cứu' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ Tim mạch' }));
    expect(screen.getByRole('button', { name: 'Gỡ thẻ Tim mạch' })).toBeInTheDocument();
  });

  it('removes an attached image from the draft', async () => {
    const user = userEvent.setup();
    setup(editDraft, 2);
    await user.click(screen.getByRole('button', { name: 'Gỡ ảnh a.png' }));
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh a.png' })).toBeNull();
  });
});
