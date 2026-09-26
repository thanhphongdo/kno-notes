import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonGroup } from './skeleton';

describe('Skeleton', () => {
  it('paints with surface2 and the requested radius', () => {
    render(<Skeleton radius="12" className="h-52" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toContain('bg-surface2');
    expect(el.className).toContain('rounded-12');
    expect(el.className).toContain('h-52');
  });

  it('hides itself from assistive tech', () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveAttribute('aria-hidden', 'true');
  });

  it('SkeletonGroup carries the qpulse animation and a busy status', () => {
    render(
      <SkeletonGroup label="Đang soạn câu hỏi…">
        <Skeleton className="h-22 w-[80%]" radius="6" />
      </SkeletonGroup>,
    );
    const group = screen.getByRole('status', { name: 'Đang soạn câu hỏi…' });
    expect(group.className).toContain('animate-[qpulse_1.4s_ease-in-out_infinite]');
    expect(group).toHaveAttribute('aria-busy', 'true');
  });
});
