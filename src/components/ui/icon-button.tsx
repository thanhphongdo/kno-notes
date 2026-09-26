'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { RADIUS_CLASS, type Radius } from './button';
import { Icon, type IconName } from './icon';

const iconButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center border-0 p-0 transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        ghost: 'bg-transparent hover:bg-surface2',
        bordered: 'border border-line bg-surface hover:border-line2',
        soft: 'bg-surface2 hover:bg-line',
        overlay: 'bg-[rgba(0,0,0,.55)] text-white',
        lightbox: 'bg-[rgba(255,255,255,.1)] text-white',
      },
      size: {
        44: 'h-44 w-44', 40: 'h-40 w-40', 36: 'h-36 w-36', 34: 'h-34 w-34', 32: 'h-32 w-32',
        30: 'h-30 w-30', 24: 'h-24 w-24', 22: 'h-22 w-22', 18: 'h-18 w-18',
      },
      tone: {
        default: 'text-text',
        muted: 'text-muted',
        faint: 'text-faint',
        hi: 'text-hi',
        med: 'text-med',
        accent: 'text-accent',
      },
      hoverTone: {
        none: '',
        text: 'hover:text-text',
        hi: 'hover:text-hi',
        accent: 'hover:text-accent',
      },
    },
    defaultVariants: { variant: 'ghost', size: 32, tone: 'muted', hoverTone: 'none' },
  },
);

export type IconButtonVariant = NonNullable<VariantProps<typeof iconButtonVariants>['variant']>;

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>,
    VariantProps<typeof iconButtonVariants> {
  icon: IconName;
  /** Required: becomes both `title` and `aria-label`. */
  label: string;
  radius?: Radius;
  iconSize?: number;
  iconFilled?: boolean;
  strokeWidth?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon, label, variant, size, tone, hoverTone, radius = '8', iconSize = 16,
    iconFilled, strokeWidth, className, type = 'button', ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size, tone, hoverTone }), RADIUS_CLASS[radius], className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize} filled={iconFilled} strokeWidth={strokeWidth} />
    </button>
  );
});
