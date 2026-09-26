'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';

export const RADIUS_CLASS = {
  '2': 'rounded-2', '3': 'rounded-3', '4': 'rounded-4', '5': 'rounded-5',
  '6': 'rounded-6', '7': 'rounded-7', '8': 'rounded-8', '9': 'rounded-9',
  '10': 'rounded-10', '11': 'rounded-11', '12': 'rounded-12', '14': 'rounded-14',
  full: 'rounded-full', circle: 'rounded-circle',
} as const;
export type Radius = keyof typeof RADIUS_CLASS;

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-6 whitespace-nowrap border-0 font-medium select-none transition-[opacity,background-color,border-color,color] duration-150 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:opacity-90 disabled:opacity-35',
        ink: 'bg-text text-bg hover:opacity-[.88] disabled:opacity-40',
        secondary:
          'border border-line bg-surface text-text font-normal hover:border-line2 disabled:opacity-40',
        ghost: 'bg-transparent text-muted font-normal hover:bg-surface2 hover:text-text',
        danger: 'bg-hi text-surface hover:opacity-90',
        dangerGhost: 'bg-transparent text-hi font-normal hover:bg-hi-soft',
        warn: 'bg-med text-surface hover:opacity-90',
        warnGhost: 'bg-transparent text-med font-normal hover:bg-med-soft',
        link: 'bg-transparent p-0 text-accent hover:underline',
      },
      size: {
        '46': 'h-46 px-14 rounded-10 text-15',
        '44': 'h-44 px-22 rounded-10 text-15',
        '42': 'h-42 px-18 rounded-10 text-14',
        '40': 'h-40 px-16 rounded-10 text-14',
        '38': 'h-38 px-18 rounded-9 text-14',
        '36': 'h-36 px-12 rounded-9 text-13',
        '32': 'h-32 px-14 rounded-8 text-13',
        '30': 'h-30 px-8 rounded-full text-13',
        auto: 'rounded-8 text-13',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: '36', fullWidth: false },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Overrides the size default. */
  radius?: Radius;
  icon?: IconName;
  iconSize?: number;
  iconFilled?: boolean;
  trailingIcon?: IconName;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className, variant, size, fullWidth, radius, icon, iconSize = 15, iconFilled,
    trailingIcon, type = 'button', children, ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), radius && RADIUS_CLASS[radius], className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={iconSize} filled={iconFilled} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </button>
  );
});
