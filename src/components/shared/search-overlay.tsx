'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { IconButton } from '@/components/ui/icon-button';

export const SEARCH_OVERLAY_LABEL = 'Tìm kiếm';
export const SEARCH_OVERLAY_CLOSE_LABEL = 'Đóng';

export interface SearchOverlayProps {
  /** The real `<SearchBox/>` body — it lives in the overlay's top bar while open. */
  input: ReactNode;
  /** `<SearchSuggestions/>`, given the whole viewport below the top bar. */
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * The mobile (`< 820px`) full-screen search surface.
 *
 * Purely presentational: it owns the frame, the body-scroll lock and nothing
 * else. `open` lives in the shell, the data lives in `SearchContainer`, and the
 * history entry that makes the Back gesture close the overlay is managed there
 * too — this component is mounted only while the overlay is open.
 *
 * Portalled to `<body>`: the header is `position: sticky` with `z-index: 30`,
 * which is its own stacking context, so a `fixed` child of the header can never
 * paint above the sidebar (z50) no matter what z-index it asks for.
 *
 * Layers (Design Spec §04): **z70** — above every piece of app chrome
 * (header 30, drawer backdrop 40, sidebar 50, settings 60/61) and below the
 * highlight popup (80), toast (90), quiz modal (95) and lightbox (100).
 */
export function SearchOverlay({ input, children, onClose, className }: SearchOverlayProps) {
  // Lock the page behind the overlay. `overflow: hidden` alone is ignored by
  // mobile Safari, so the body is pinned and the scroll offset restored by hand.
  useEffect(() => {
    const { body } = document;
    const y = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `${-y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      if (y) window.scrollTo(0, y);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-search-overlay=""
      role="dialog"
      aria-modal="true"
      aria-label={SEARCH_OVERLAY_LABEL}
      className={cn(
        'fixed inset-0 flex flex-col bg-bg text-text',
        'motion-safe:[animation:searchOverlayIn_.18s_ease-out]',
        className,
      )}
      style={{ zIndex: Z.searchOverlay }}
    >
      {/* Same 64px / pad-x 16 as the mobile header it covers (Design Spec §03). */}
      <div className="flex h-64 shrink-0 items-center gap-10 border-b border-line px-16">
        <div className="min-w-0 flex-1">{input}</div>
        <IconButton
          icon="close"
          label={SEARCH_OVERLAY_CLOSE_LABEL}
          size={44}
          radius="10"
          iconSize={18}
          tone="default"
          onClick={onClose}
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-8 pb-32">{children}</div>
    </div>,
    document.body,
  );
}
