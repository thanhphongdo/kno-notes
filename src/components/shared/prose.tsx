'use client';

import type { HTMLAttributes, RefObject } from 'react';
import { cn } from '@/lib/utils';

export interface ProseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'dangerouslySetInnerHTML'> {
  /**
   * Trusted, app-generated HTML (editor output or a stored version). Callers are
   * responsible for sanitizing anything that did not come from this app.
   */
  html: string;
  proseRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Read-only prose surface. All typography comes from the global `[data-prose]`
 * rules in globals.css and scales with `--fs` (14–22).
 */
export function Prose({ html, proseRef, className, ...rest }: ProseProps) {
  return (
    <div
      ref={proseRef}
      data-prose="1"
      className={cn(className)}
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  );
}
