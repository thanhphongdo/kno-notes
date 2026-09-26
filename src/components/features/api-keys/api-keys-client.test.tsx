import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { ApiKeysClient } from './api-keys-client';

const keys = [
  { id: 'k1', userId: 'u1', name: 'Claude Code', prefix: 'kn_1a2b3c4', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null },
];

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

const show = () => render(<ApiKeysClient baseUrl="http://localhost:3000" />, { wrapper });

const listOk = () => ({ ok: true, json: async () => ({ keys }) });

let writeText: ReturnType<typeof vi.fn>;

describe('ApiKeysClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  it('lists existing keys by prefix and never shows a full token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listOk()));
    show();
    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText(/kn_1a2b3c4/)).toBeInTheDocument();
    expect(screen.getByText(/chưa dùng/)).toBeInTheDocument();
  });

  it('shows an empty state when the user has no keys yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) }));
    show();
    expect(await screen.findByText('Chưa có key nào')).toBeInTheDocument();
  });

  it('shows the secret exactly once after creating a key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: { ...keys[0], id: 'k2', name: 'Codex' }, key: 'kn_SECRET_VALUE' }),
      })
      .mockResolvedValue(listOk());
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    show();

    await user.type(await screen.findByPlaceholderText('Tên key, VD: Claude Code'), 'Codex');
    await user.click(screen.getByRole('button', { name: 'Tạo key' }));

    expect(await screen.findByText('kn_SECRET_VALUE')).toBeInTheDocument();
    expect(screen.getByText('Chỉ hiển thị một lần. Lưu lại trước khi rời trang.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys', expect.objectContaining({ method: 'POST' }));

    await user.click(screen.getByRole('button', { name: 'Đã lưu' }));
    await waitFor(() => expect(screen.queryByText('kn_SECRET_VALUE')).toBeNull());
  });

  it('refuses to create a key without a name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listOk());
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    show();
    await screen.findByText('Claude Code');
    await user.click(screen.getByRole('button', { name: 'Tạo key' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks before revoking and only deletes on confirm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listOk());
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    expect(
      screen.getByText('Thu hồi key này? Các ứng dụng đang dùng sẽ mất quyền truy cập.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Thu hồi' }));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys/k1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('copies the secret to the clipboard', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ apiKey: keys[0], key: 'kn_SECRET_VALUE' }) })
      .mockResolvedValue(listOk());
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, so override it after.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show();

    await user.type(await screen.findByPlaceholderText('Tên key, VD: Claude Code'), 'Codex');
    await user.click(screen.getByRole('button', { name: 'Tạo key' }));
    await screen.findByText('kn_SECRET_VALUE');
    await user.click(screen.getByRole('button', { name: 'Sao chép khoá' }));
    expect(writeText).toHaveBeenCalledWith('kn_SECRET_VALUE');
  });

  it('survives a failing list request without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    show();
    expect(await screen.findByText('Chưa có key nào')).toBeInTheDocument();
  });
});
