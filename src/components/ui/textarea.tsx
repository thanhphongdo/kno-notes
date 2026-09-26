'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'w-full min-w-0 border-0 bg-transparent p-0 text-text outline-none placeholder:text-faint',
  {
    variants: {
      tone: {
        /** Comment composer: 15/1.55, min-height 48, vertical resize. */
        comment: 'min-h-48 resize-y text-15 leading-[1.55]',
        /** Editor description: 17/1.55 muted, no resize. */
        desc: 'resize-none text-17 leading-[1.55] text-muted',
      },
    },
    defaultVariants: { tone: 'comment' },
  },
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, tone, rows = 2, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(textareaVariants({ tone }), className)} {...rest} />;
});
