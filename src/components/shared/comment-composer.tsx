'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const COMMENT_PLACEHOLDER = 'Thêm bình luận, kinh nghiệm thực tế, ca bệnh liên quan…';

export interface CommentComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  className?: string;
}

/** p 12 · gap 10 · r12 · 1px --line · --surface. Cmd/Ctrl + Enter submits. */
export function CommentComposer({ value, onValueChange, onSubmit, className }: CommentComposerProps) {
  const canSubmit = value.trim().length > 0;
  return (
    <div className={cn('flex flex-col gap-10 rounded-12 border border-line bg-surface p-12', className)}>
      <Textarea
        tone="comment"
        value={value}
        placeholder={COMMENT_PLACEHOLDER}
        aria-label="Thêm bình luận"
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-12 text-faint">⌘/Ctrl + Enter để gửi</span>
        <Button
          variant="primary"
          size="32"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(!canSubmit && 'opacity-40')}
        >
          Gửi
        </Button>
      </div>
    </div>
  );
}
