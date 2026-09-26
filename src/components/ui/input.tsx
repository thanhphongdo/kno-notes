'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'w-full min-w-0 text-text outline-none transition-colors duration-150 placeholder:text-faint',
  {
    variants: {
      inputSize: {
        '46': 'h-46 px-14 rounded-10 text-15',
        '42': 'h-42 px-12 rounded-10 text-14',
        '40': 'h-40 px-12 rounded-10 text-13',
      },
      tone: {
        default: 'border border-line bg-surface focus:border-accent',
        strong: 'border border-line2 bg-surface focus:border-accent',
        ghost: 'border-0 bg-transparent px-0',
      },
    },
    defaultVariants: { inputSize: '40', tone: 'default' },
  },
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize, tone, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ? 'true' : undefined}
      className={cn(inputVariants({ inputSize, tone }), invalid && 'border-hi', className)}
      {...rest}
    />
  );
});
