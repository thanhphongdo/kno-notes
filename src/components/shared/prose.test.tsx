import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Prose } from './prose';

describe('Prose', () => {
  it('marks itself with data-prose so the global stylesheet applies', () => {
    const { container } = render(<Prose html="<p>Xin chào</p>" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('data-prose', '1');
  });

  it('renders the supplied HTML', () => {
    render(<Prose html="<h2>Mục tiêu điều trị</h2><p>Dưới 130/80 mmHg.</p>" />);
    expect(screen.getByRole('heading', { name: 'Mục tiêu điều trị', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Dưới 130/80 mmHg.')).toBeInTheDocument();
  });

  it('keeps mark[data-hl] elements intact', () => {
    const { container } = render(<Prose html={'<p>A <mark data-hl="h1">đánh dấu</mark> B</p>'} />);
    const mark = container.querySelector('mark[data-hl="h1"]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('đánh dấu');
  });

  it('renders an empty container for empty content', () => {
    const { container } = render(<Prose html="" />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('forwards extra class names', () => {
    const { container } = render(<Prose html="<p>x</p>" className="mt-28" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('mt-28');
  });
});
