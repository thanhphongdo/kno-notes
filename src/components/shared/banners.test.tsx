import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DELETE_CONFIRM_MESSAGE, DeleteConfirmBanner } from './delete-confirm-banner';
import { VersionBanner } from './version-banner';

describe('VersionBanner', () => {
  it('paints med-soft and shows both actions', () => {
    const { container } = render(
      <VersionBanner versionLabel="v2" dateLabel="12/09/2026 · Khôi phục từ v1"
        onBackToCurrent={() => {}} onRestore={() => {}} />,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-med-soft');
    expect(screen.getByText('v2').className).toContain('font-mono');
    expect(screen.getByRole('button', { name: 'Về bản hiện tại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục bản này' })).toBeInTheDocument();
  });

  it('emits both actions', async () => {
    const onBackToCurrent = vi.fn();
    const onRestore = vi.fn();
    render(
      <VersionBanner versionLabel="v2" dateLabel="12/09/2026"
        onBackToCurrent={onBackToCurrent} onRestore={onRestore} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Về bản hiện tại' }));
    expect(onBackToCurrent).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục bản này' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteConfirmBanner', () => {
  it('asks inline with the exact Vietnamese wording', () => {
    render(<DeleteConfirmBanner onCancel={() => {}} onConfirm={() => {}} />);
    expect(DELETE_CONFIRM_MESSAGE).toBe('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?');
    expect(screen.getByText(DELETE_CONFIRM_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('paints hi-soft and emits both actions', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(<DeleteConfirmBanner onCancel={onCancel} onConfirm={onConfirm} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-hi-soft');
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
