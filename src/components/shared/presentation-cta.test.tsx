import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresentationCta } from './presentation-cta';

describe('PresentationCta', () => {
  it('nói đúng số slide của bài và gọi về khi bấm', async () => {
    const onStart = vi.fn();
    render(<PresentationCta slideCount={11} onStart={onStart} />);
    expect(screen.getByText('Bản trình chiếu đã sẵn sàng')).toBeInTheDocument();
    expect(screen.getByText('11 slide, dựng từ chính nội dung ghi chú này.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Trình chiếu' }).click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
