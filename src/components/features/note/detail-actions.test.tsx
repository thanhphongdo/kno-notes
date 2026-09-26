import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { DetailActions } from './detail-actions';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
}));

function setup(props?: Partial<Parameters<typeof DetailActions>[0]>) {
  return render(
    <ToastProvider>
      <DetailActions
        noteId="n1"
        fav={false}
        updatedLabel="2 giờ trước"
        versionLabel="v3"
        disabled={false}
        onStartQuiz={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );
}

describe('DetailActions', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ fav: true }) }),
    );
  });

  it('renders the meta line with the relative update time and the version', () => {
    setup();
    expect(screen.getByText(/2 giờ trước/)).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('shows "Yêu thích" when not favourited and "Đã yêu thích" after toggling', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/favorite', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('button', { name: 'Đã yêu thích' })).toBeInTheDocument();
  });

  it('rolls the star back when the favourite call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(await screen.findByRole('button', { name: 'Yêu thích' })).toBeInTheDocument();
  });

  it('asks for confirmation inline before deleting, and Huỷ cancels', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.getByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes and returns to the dashboard on confirm', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    const banner = screen.getByRole('alertdialog');
    await user.click(within(banner).getByRole('button', { name: 'Xoá' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(await screen.findByText('Đã xoá ghi chú')).toBeInTheDocument();
  });

  it('disables favourite, delete and quiz while an old version is displayed', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button', { name: 'Yêu thích' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trắc nghiệm' })).toBeDisabled();
  });

  it('links to the editor', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Chỉnh sửa' })).toHaveAttribute('href', '/notes/n1/edit');
  });
});