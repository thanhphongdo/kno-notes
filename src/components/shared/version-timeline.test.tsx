import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VersionTimeline } from './version-timeline';

const VERSIONS = [
  { v: 3, note: 'Cập nhật nội dung', dateLabel: '20/09/2026', current: true },
  { v: 2, note: 'Khôi phục từ v1', dateLabel: '12/09/2026', current: false },
  { v: 1, note: 'Tạo ghi chú', dateLabel: '01/09/2026', current: false },
];

describe('VersionTimeline', () => {
  it('lists newest first with a mono version label and note', () => {
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={() => {}} />);
    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveTextContent('v3 · Cập nhật nội dung');
    expect(items[2]).toHaveTextContent('v1 · Tạo ghi chú');
  });

  it('emits data-version-item / data-version hooks', () => {
    const { container } = render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={() => {}} />);
    const items = container.querySelectorAll('[data-version-item]');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-version', '3');
  });

  it('marks the newest entry with "· hiện tại"', () => {
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={() => {}} />);
    expect(screen.getByText('20/09/2026 · hiện tại')).toBeInTheDocument();
    expect(screen.getByText('12/09/2026')).toBeInTheDocument();
  });

  it('fills the dot with accent for the selected version only', () => {
    const { container } = render(<VersionTimeline versions={VERSIONS} selected={2} onSelect={() => {}} />);
    const dots = container.querySelectorAll('span.rounded-circle');
    expect(dots[1]?.className).toContain('bg-accent');
    expect(dots[0]?.className).toContain('bg-surface');
  });

  it('emits the clicked version', async () => {
    const onSelect = vi.fn();
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Tạo ghi chú/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
