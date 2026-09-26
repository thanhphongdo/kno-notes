'use client';

import { forwardRef } from 'react';
import { IconButton, type IconButtonProps } from './icon-button';

export interface ToggleProps extends Omit<IconButtonProps, 'aria-pressed'> {
  pressed: boolean;
}

/** A single on/off icon button — e.g. the favourite star on cards and rows. */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle({ pressed, ...rest }, ref) {
  return <IconButton ref={ref} aria-pressed={pressed} {...rest} />;
});
