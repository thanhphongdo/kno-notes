'use client';

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefCallback,
} from 'react';
import { Z } from '@/lib/z';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  MIN_SCALE, TAP_SLOP_PX,
  clampPan, clampScale, dismissOpacity, distance, fittedSize, focalOffset, isDoubleTap,
  lockAxis, midpoint, resolveRelease, toggleScale, wrapIndex,
  type Axis, type Point, type Size, type Tap,
} from '@/lib/gesture/lightbox';
import type { NoteImage } from './image-thumb';

export interface LightboxProps {
  images: readonly NoteImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Gap between carousel slides so two images never touch mid-swipe. */
const SLIDE_GAP = 16;
/** Design Spec §04 — the lightbox's own easing. */
const SETTLE = 'transform .26s cubic-bezier(.22,.61,.36,1)';
const STRIPES = 'repeating-linear-gradient(135deg, #1c1f21 0 14px, #232729 14px 28px)';

const ORIGIN: Point = { x: 0, y: 0 };
const FIT = { scale: MIN_SCALE, x: 0, y: 0 };

interface Zoom {
  scale: number;
  x: number;
  y: number;
}

/** The live gesture. Kept in a ref: pointer maths must never wait for a render. */
interface Gesture {
  kind: 'swipe' | 'pan' | 'pinch';
  axis: Axis;
  start: Point;
  startedAt: number;
  startScale: number;
  startOffset: Point;
  startDistance: number;
  startFocal: Point;
  /** Farthest the pointer travelled — a tap is a gesture that never moved. */
  travel: number;
}

/**
 * The image, or the prototype's 135° striped placeholder when a note carries a
 * label but no file yet. One definition, used by both layouts — desktop caps it
 * at 92vw × 78vh, mobile lets it fill the stage.
 */
function LightboxMedia({
  image, current, mobile, onClick, imgRef, onLoad,
}: {
  image: NoteImage;
  /** Only the centre slide is the one e2e (and a screen reader) should see. */
  current: boolean;
  mobile: boolean;
  onClick?: (e: MouseEvent) => void;
  imgRef?: RefCallback<HTMLImageElement>;
  onLoad?: (e: { currentTarget: HTMLImageElement }) => void;
}) {
  if (!image.src) {
    return (
      <div
        data-lightbox-image={current ? '' : undefined}
        aria-hidden={current ? undefined : true}
        onClick={onClick}
        className={cn(
          'flex aspect-[4/3] items-center justify-center font-mono text-13 text-[#7c8388]',
          mobile ? 'w-[92vw] rounded-8' : 'max-h-[74vh] w-[min(80vw,900px)] rounded-10',
        )}
        style={{ background: STRIPES }}
      >
        {`hình ảnh · ${image.label}`}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={image.src}
      alt={current ? image.label : ''}
      data-lightbox-image={current ? '' : undefined}
      aria-hidden={current ? undefined : true}
      draggable={false}
      onLoad={onLoad}
      onClick={onClick}
      className={cn('block', mobile ? 'max-h-full max-w-full object-contain' : 'max-h-[78vh] max-w-[92vw] rounded-8')}
    />
  );
}

/**
 * Full-screen image viewer.
 *
 * Desktop is Design Spec §06 unchanged: `rgba(8,9,10,.88)` scrim at z100, the
 * image capped at 92vw × 78vh, a 40px close button, `← →` when there is more
 * than one image, `Esc` and the arrow keys.
 *
 * Under 820px the same component becomes a touch viewer, because an 800×600
 * diagram with Vietnamese labels is unreadable letterboxed into a phone:
 * the image fills the viewport inside the safe areas, a horizontal drag moves
 * the carousel with the finger, pinch and double tap zoom between 1× and 4×
 * with panning, and a downward drag dismisses. The gesture arithmetic lives in
 * `@/lib/gesture/lightbox`; this file only turns pointer events into calls.
 */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const total = images.length;
  const current = images[index];
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();

  const [drag, setDrag] = useState<Point>(ORIGIN);
  const [zoom, setZoom] = useState<Zoom>(FIT);
  const [settling, setSettling] = useState(false);
  const [interacting, setInteracting] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<Tap | null>(null);
  const natural = useRef<Size>({ width: 0, height: 0 });
  const committing = useRef(false);
  // Mirrors of the two pieces of state the handlers read back, so a burst of
  // pointermove events never reasons about a value React has not flushed yet.
  const dragRef = useRef<Point>(ORIGIN);
  const zoomRef = useRef<Zoom>(FIT);

  const applyDrag = useCallback((next: Point) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const applyZoom = useCallback((next: Zoom) => {
    zoomRef.current = next;
    setZoom(next);
  }, []);

  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onIndexChange(wrapIndex(index, total, -1));
      else if (e.key === 'ArrowRight') onIndexChange(wrapIndex(index, total, 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, total, onClose, onIndexChange]);

  // A full-screen viewer that lets the page scroll underneath it is a phone
  // bug, not a nicety: the finger that pans a zoomed image would also move the
  // article behind the scrim.
  useEffect(() => {
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobile]);

  // Landing on a new image always starts fitted — except during a commit, where
  // the index change *is* the animation and the offset is deliberate.
  useEffect(() => {
    natural.current = { width: 0, height: 0 };
    if (committing.current) return;
    dragRef.current = ORIGIN;
    zoomRef.current = FIT;
    setDrag(ORIGIN);
    setZoom(FIT);
  }, [index]);

  const viewport = useCallback((): Size => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) return { width: rect.width, height: rect.height };
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    return { width: window.innerWidth, height: window.innerHeight };
  }, []);

  const centre = useCallback((): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return ORIGIN;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const settle = useCallback((next: Zoom) => {
    const box = viewport();
    applyZoom({ scale: next.scale, ...clampPan(next, fittedSize(natural.current, box), box, next.scale) });
  }, [applyZoom, viewport]);

  /**
   * Step to a neighbour without the image jumping.
   *
   * The slide the finger dragged in is already on screen; re-parenting it to
   * the centre and animating the leftover offset back to zero is what makes a
   * commit look like one continuous movement rather than a cut.
   */
  const commit = useCallback((step: 1 | -1) => {
    const width = stageRef.current?.clientWidth ?? viewport().width;
    const nextIndex = wrapIndex(index, total, step);

    if (reducedMotion) {
      applyDrag(ORIGIN);
      setSettling(false);
      onIndexChange(nextIndex);
      return;
    }

    committing.current = true;
    setSettling(false);
    applyDrag({ x: dragRef.current.x + step * (width + SLIDE_GAP), y: 0 });
    onIndexChange(nextIndex);
    // One frame for the browser to paint the un-transitioned hand-over, the
    // next to start the transition back to centre.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        committing.current = false;
        setSettling(true);
        applyDrag(ORIGIN);
      });
    });
  }, [applyDrag, index, onIndexChange, reducedMotion, total, viewport]);

  const zoomToTap = useCallback((tap: Point) => {
    const from = zoomRef.current.scale;
    const to = toggleScale(from);
    setSettling(!reducedMotion);
    if (to === MIN_SCALE) {
      applyZoom(FIT);
      return;
    }
    settle({ scale: to, ...focalOffset(zoomRef.current, tap, centre(), from, to) });
  }, [applyZoom, centre, reducedMotion, settle]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
    setSettling(false);

    const open = [...pointers.current.values()];
    if (open.length >= 2) {
      const [a, b] = [open[0] as Point, open[1] as Point];
      applyDrag(ORIGIN);
      gesture.current = {
        kind: 'pinch',
        axis: 'none',
        start: midpoint(a, b),
        startedAt: e.timeStamp,
        startScale: zoomRef.current.scale,
        startOffset: { x: zoomRef.current.x, y: zoomRef.current.y },
        startDistance: distance(a, b),
        startFocal: midpoint(a, b),
        travel: 0,
      };
      return;
    }

    gesture.current = {
      // Zoomed in, one finger means pan: panning always wins over the carousel.
      kind: zoomRef.current.scale > MIN_SCALE ? 'pan' : 'swipe',
      axis: 'none',
      start: { x: e.clientX, y: e.clientY },
      startedAt: e.timeStamp,
      startScale: zoomRef.current.scale,
      startOffset: { x: zoomRef.current.x, y: zoomRef.current.y },
      startDistance: 0,
      startFocal: ORIGIN,
      travel: 0,
    };
  }, [applyDrag]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      const open = [...pointers.current.values()];
      if (open.length < 2) return;
      const [a, b] = [open[0] as Point, open[1] as Point];
      const scale = clampScale(g.startScale * (distance(a, b) / (g.startDistance || 1)));
      const focal = midpoint(a, b);
      const anchored = focalOffset(g.startOffset, g.startFocal, centre(), g.startScale, scale);
      settle({
        scale,
        x: anchored.x + (focal.x - g.startFocal.x),
        y: anchored.y + (focal.y - g.startFocal.y),
      });
      return;
    }

    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    g.travel = Math.max(g.travel, Math.hypot(dx, dy));

    if (g.kind === 'pan') {
      settle({ scale: g.startScale, x: g.startOffset.x + dx, y: g.startOffset.y + dy });
      return;
    }

    // Until the direction is clear the gesture moves nothing, so a vertical
    // flick is never stolen from the page and a swipe never drifts diagonally.
    if (g.axis === 'none') g.axis = lockAxis(dx, dy);
    if (g.axis === 'x') applyDrag({ x: dx, y: 0 });
    else if (g.axis === 'y') applyDrag({ x: 0, y: dy });
  }, [applyDrag, centre, settle]);

  const endPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;

    const remaining = [...pointers.current.values()];
    if (remaining.length === 0) setInteracting(false);
    setSettling(!reducedMotion);

    if (g.kind === 'pinch') {
      // Let go of a pinch that shrank back to fit and the carousel is live again.
      if (zoomRef.current.scale <= MIN_SCALE + 0.01) applyZoom(FIT);
      const rest = remaining[0];
      gesture.current = rest
        ? {
            kind: 'pan',
            axis: 'none',
            start: rest,
            startedAt: e.timeStamp,
            startScale: zoomRef.current.scale,
            startOffset: { x: zoomRef.current.x, y: zoomRef.current.y },
            startDistance: 0,
            startFocal: ORIGIN,
            travel: 0,
          }
        : null;
      return;
    }

    gesture.current = null;

    if (!cancelled && g.travel <= TAP_SLOP_PX) {
      const tap: Tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (isDoubleTap(lastTap.current, tap)) {
        lastTap.current = null;
        zoomToTap(tap);
      } else {
        lastTap.current = tap;
      }
      applyDrag(ORIGIN);
      return;
    }
    lastTap.current = null;

    if (g.kind === 'pan') return;

    const outcome = cancelled
      ? 'stay'
      : resolveRelease({
          axis: g.axis,
          dx: dragRef.current.x,
          dy: dragRef.current.y,
          elapsedMs: e.timeStamp - g.startedAt,
          viewport: viewport(),
          canSwipe: total > 1,
          canDismiss: zoomRef.current.scale <= MIN_SCALE,
        });

    if (outcome === 'next') commit(1);
    else if (outcome === 'prev') commit(-1);
    else if (outcome === 'dismiss') onClose();
    else applyDrag(ORIGIN);
  }, [applyDrag, applyZoom, commit, onClose, reducedMotion, total, viewport, zoomToTap]);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => endPointer(e, false),
    [endPointer],
  );
  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => endPointer(e, true),
    [endPointer],
  );

  const measure = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) natural.current = { width: el.naturalWidth, height: el.naturalHeight };
  }, []);

  if (total === 0 || !current) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();
  const prev = () => onIndexChange(wrapIndex(index, total, -1));
  const next = () => onIndexChange(wrapIndex(index, total, 1));
  const transition = settling && !reducedMotion ? SETTLE : 'none';

  const caption = (
    <>
      {total > 1 ? (
        <IconButton
          icon="chevron-left"
          label="Ảnh trước"
          variant="lightbox"
          size={36}
          radius="9"
          iconSize={16}
          onClick={prev}
        />
      ) : null}
      <span>
        {current.label}
        <span data-lightbox-counter="" className="ml-6 font-mono text-12 text-[#8a9095]">
          {`${index + 1} / ${total}`}
        </span>
      </span>
      {total > 1 ? (
        <IconButton
          icon="chevron-right"
          label="Ảnh sau"
          variant="lightbox"
          size={36}
          radius="9"
          iconSize={16}
          onClick={next}
        />
      ) : null}
    </>
  );

  const closeButton = (style?: CSSProperties) => (
    <IconButton
      icon="close"
      label="Đóng"
      variant="lightbox"
      size={40}
      radius="10"
      iconSize={18}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      className="absolute right-16 top-16"
      style={style}
    />
  );

  if (isMobile) {
    const offsets: readonly number[] = total > 1 ? [-1, 0, 1] : [0];
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Xem ảnh"
        data-lightbox=""
        data-lightbox-mobile=""
        className="fixed inset-0 flex touch-none select-none flex-col overscroll-contain bg-[rgba(8,9,10,.88)]"
        style={{ zIndex: Z.lightbox, height: '100dvh', opacity: dismissOpacity(drag.y, viewportHeight) }}
      >
        <div
          ref={stageRef}
          className="relative min-h-0 flex-1 overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {offsets.map((offset) => {
            const slide = images[wrapIndex(index, total, offset)];
            if (!slide) return null;
            const isCurrent = offset === 0;
            const shiftX = offset * SLIDE_GAP + drag.x + (isCurrent ? zoom.x : 0);
            const shiftY = drag.y + (isCurrent ? zoom.y : 0);
            return (
              <div
                key={`${slide.id}:${offset}`}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform:
                    `translate3d(calc(${offset * 100}% + ${shiftX}px), ${shiftY}px, 0)` +
                    (isCurrent && zoom.scale !== 1 ? ` scale(${zoom.scale})` : ''),
                  transition,
                  willChange: 'transform',
                }}
              >
                <LightboxMedia
                  image={slide}
                  current={isCurrent}
                  mobile
                  imgRef={isCurrent ? measure : undefined}
                  onLoad={isCurrent
                    ? (e) => {
                        natural.current = {
                          width: e.currentTarget.naturalWidth,
                          height: e.currentTarget.naturalHeight,
                        };
                      }
                    : undefined}
                />
              </div>
            );
          })}
        </div>

        {closeButton({
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
          opacity: interacting ? 0 : 1,
          transition: 'opacity .15s',
        })}

        {/* Chrome sits over the image rather than stealing height from it, and
            steps out of the way while a gesture is in flight. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-16"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            opacity: interacting ? 0 : 1,
            transition: 'opacity .15s',
          }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-12 rounded-full bg-[rgba(8,9,10,.55)] py-6 pr-6 pl-14 text-14 text-[#e6e7e5] backdrop-blur-sm">
            {caption}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      data-lightbox=""
      onClick={onClose}
      className="fixed inset-0 flex flex-col items-center justify-center gap-16 bg-[rgba(8,9,10,.88)] p-24"
      style={{ zIndex: Z.lightbox }}
    >
      {closeButton()}
      <LightboxMedia image={current} current mobile={false} onClick={stop} />
      <div onClick={stop} className="flex items-center gap-16 text-14 text-[#e6e7e5]">
        {caption}
      </div>
    </div>
  );
}
