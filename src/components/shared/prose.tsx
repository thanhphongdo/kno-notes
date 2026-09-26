'use client';

import { memo, useMemo, type HTMLAttributes, type RefObject } from 'react';
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
function ProseImpl({ html, proseRef, className, ...rest }: ProseProps) {
  // React re-applies `dangerouslySetInnerHTML` when the wrapper object's
  // identity changes, which wipes DOM the browser owns — a live highlight
  // range, the user's selection — even when the HTML string is identical.
  // Memoising keeps the identity stable so an unrelated re-render (opening the
  // highlight bubble, say) leaves the prose subtree untouched.
  const inner = useMemo(() => ({ __html: html }), [html]);
  return (
    <div
      ref={proseRef}
      data-prose="1"
      className={cn(className)}
      dangerouslySetInnerHTML={inner}
      {...rest}
    />
  );
}

/**
 * Memoised so a parent re-render with unchanged props cannot touch the prose
 * subtree at all. `DetailClient` passes `useCallback`-stable handlers.
 */
export const Prose = memo(ProseImpl);
