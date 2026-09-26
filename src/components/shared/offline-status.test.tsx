import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE_SYNC_ACTION, OfflineStatus, offlineSummary } from './offline-status';

const base = { online: true, phase: 'ready' as const, cached: 0, total: 0, pending: 0 };

describe('offlineSummary', () => {
  it('says how much is readable without a connection', () => {
    expect(offlineSummary({ ...base, cached: 14, total: 14 })).toBe(
      'Đã tải 14 ghi chú — đọc được cả khi mất mạng.',
    );
  });

  it('admits when the copy is incomplete', () => {
    expect(offlineSummary({ ...base, cached: 9, total: 14 })).toBe(
      'Đã tải 9/14 ghi chú để đọc khi mất mạng.',
    );
  });

  it('says nothing is downloaded yet rather than pretending', () => {
    expect(offlineSummary(base)).toBe('Chưa tải ghi chú nào về máy.');
  });

  it('reports progress while downloading', () => {
    expect(offlineSummary({ ...base, phase: 'syncing', cached: 3, total: 14 })).toBe(
      'Đang tải 3/14 ghi chú về máy…',
    );
  });

  /** Ngoại tuyến mà còn việc chưa gửi thì đó là điều đáng nói nhất. */
  it('leads with unsent work when offline', () => {
    expect(offlineSummary({ ...base, online: false, cached: 14, pending: 2 })).toBe(
      '2 thay đổi đang chờ gửi khi có mạng lại.',
    );
  });

  it('tells an offline reader what they still have', () => {
    expect(offlineSummary({ ...base, online: false, cached: 14 })).toBe(
      'Đang ngoại tuyến — 14 ghi chú đọc được.',
    );
    expect(offlineSummary({ ...base, online: false })).toBe(
      'Đang ngoại tuyến và chưa có ghi chú nào tải sẵn.',
    );
  });

  it('says when it is pushing queued work back up', () => {
    expect(offlineSummary({ ...base, pending: 3, cached: 1 })).toBe(
      'Đang gửi 3 thay đổi làm lúc ngoại tuyến…',
    );
  });
});

describe('OfflineStatus', () => {
  it('syncs on demand', async () => {
    const onSyncNow = vi.fn();
    const user = userEvent.setup();
    render(<OfflineStatus {...base} onSyncNow={onSyncNow} />);
    await user.click(screen.getByRole('button', { name: OFFLINE_SYNC_ACTION }));
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it('does not offer to sync with no connection, or while already syncing', () => {
    const { rerender } = render(<OfflineStatus {...base} online={false} onSyncNow={vi.fn()} />);
    expect(screen.getByRole('button', { name: OFFLINE_SYNC_ACTION })).toBeDisabled();

    rerender(<OfflineStatus {...base} phase="syncing" onSyncNow={vi.fn()} />);
    expect(screen.getByRole('button', { name: OFFLINE_SYNC_ACTION })).toBeDisabled();
  });
});
