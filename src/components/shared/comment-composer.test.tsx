import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COMMENT_PLACEHOLDER, CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';

describe('CommentComposer', () => {
  it('uses the prototype placeholder and hint', () => {
    render(<CommentComposer value="" onValueChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText(COMMENT_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText('⌘/Ctrl + Enter để gửi')).toBeInTheDocument();
  });

  it('dims and disables Gửi while the draft is blank', () => {
    render(<CommentComposer value="   " onValueChange={() => {}} onSubmit={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Gửi' });
    expect(submit).toBeDisabled();
    expect(submit.className).toContain('opacity-40');
  });

  it('submits on click when there is text', async () => {
    const onSubmit = vi.fn();
    render(<CommentComposer value="Ghi chú hay" onValueChange={() => {}} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits on Ctrl+Enter but not on plain Enter', async () => {
    const onSubmit = vi.fn();
    render(<CommentComposer value="Ghi chú hay" onValueChange={() => {}} onSubmit={onSubmit} />);
    const box = screen.getByPlaceholderText(COMMENT_PLACEHOLDER);
    box.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('CommentList', () => {
  const COMMENTS = [
    { id: 'c1', text: 'Rất hữu ích.', dateLabel: '2 giờ trước', author: { id: 'u1', displayName: 'Nguyễn An' } },
    { id: 'c2', text: 'Đã áp dụng.', dateLabel: 'hôm qua', author: { id: 'u2', displayName: 'Trần Bình' } },
  ];

  it('emits data-comment / data-comment-id per item', () => {
    const { container } = render(<CommentList comments={COMMENTS} onRemove={() => {}} />);
    const items = container.querySelectorAll('[data-comment]');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-comment-id', 'c1');
  });

  it('shows each comment author rather than a hard-coded name', () => {
    render(<CommentList comments={COMMENTS} onRemove={() => {}} />);
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('Trần Bình')).toBeInTheDocument();
  });

  it('removes by id', async () => {
    const onRemove = vi.fn();
    render(<CommentList comments={COMMENTS} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bình luận 2 giờ trước' }));
    expect(onRemove).toHaveBeenCalledWith('c1');
  });
});
