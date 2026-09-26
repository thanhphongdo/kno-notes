'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Native range input — `accent-color: var(--accent)` comes from the base layer. */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider({ className, ...rest }, ref) {
  return <input ref={ref} type="range" className={cn('flex-1', className)} {...rest} />;
});
