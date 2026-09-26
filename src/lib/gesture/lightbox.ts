/**
 * Pure gesture maths for the mobile lightbox.
 *
 * Everything here is a plain function of numbers so the decisions a finger
 * triggers — which axis a drag belongs to, whether a release advances the
 * image or springs back, how far a zoomed image may be panned — can be tested
 * without a browser. `lightbox.tsx` owns the pointer plumbing and nothing else.
 *
 * Coordinates are CSS pixels in viewport space. `offset` is the translation
 * applied to the image *after* it has been centred and fitted, so `{x: 0, y: 0}`
 * always means "centred", at any scale.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Travel, in px, before a drag is committed to one axis. */
export const AXIS_LOCK_PX = 10;

/** A horizontal release advances past this share of the viewport width… */
export const SWIPE_DISTANCE_RATIO = 0.22;
/** …or at this speed (px/ms), a flick that never travelled far. */
export const SWIPE_VELOCITY = 0.45;

/** A downward release dismisses past this share of the viewport height… */
export const DISMISS_DISTANCE_RATIO = 0.2;
/** …or at this speed (px/ms). */
export const DISMISS_VELOCITY = 0.5;

/** A flick still has to be a deliberate movement, not a jittery tap. */
export const FLICK_MIN_TRAVEL_PX = 24;

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Where a double tap lands, between MIN_SCALE and MAX_SCALE. */
export const DOUBLE_TAP_SCALE = 2.5;
/** Two taps closer together than this — and this close in space — are one gesture. */
export const DOUBLE_TAP_MS = 280;
export const DOUBLE_TAP_SLOP_PX = 28;
/** A pointer that moved less than this between down and up was a tap. */
export const TAP_SLOP_PX = 10;

export type Axis = 'none' | 'x' | 'y';

/**
 * Which axis a drag belongs to, or `none` while it is still ambiguous.
 *
 * Locking matters because the lightbox sits over a scrollable page: until the
 * direction is known the gesture must not steal the drag, and once it is known
 * the other axis must be ignored entirely, or a horizontal swipe with a little
 * wobble drags the image diagonally.
 */
export function lockAxis(dx: number, dy: number, threshold: number = AXIS_LOCK_PX): Axis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return 'none';
  return ax >= ay ? 'x' : 'y';
}

export type GestureOutcome = 'prev' | 'next' | 'dismiss' | 'stay';

export interface ReleaseInput {
  axis: Axis;
  dx: number;
  dy: number;
  /** Time from pointerdown to pointerup, in ms. */
  elapsedMs: number;
  viewport: Size;
  /** False for a single image: a horizontal drag can only spring back. */
  canSwipe: boolean;
  /** False while zoomed in: the drag was a pan, not a dismissal. */
  canDismiss: boolean;
}

/** px per ms, guarding the zero-duration case a synthetic event can produce. */
function velocity(distancePx: number, elapsedMs: number): number {
  return Math.abs(distancePx) / Math.max(elapsedMs, 1);
}

/** What a released drag should do: step, dismiss, or spring back. */
export function resolveRelease(input: ReleaseInput): GestureOutcome {
  const { axis, dx, dy, elapsedMs, viewport, canSwipe, canDismiss } = input;

  if (axis === 'x') {
    if (!canSwipe || dx === 0) return 'stay';
    const far = Math.abs(dx) >= viewport.width * SWIPE_DISTANCE_RATIO;
    const fast =
      velocity(dx, elapsedMs) >= SWIPE_VELOCITY && Math.abs(dx) >= FLICK_MIN_TRAVEL_PX;
    if (!far && !fast) return 'stay';
    return dx < 0 ? 'next' : 'prev';
  }

  if (axis === 'y') {
    // Only downward dismisses; dragging up is not a gesture here.
    if (!canDismiss || dy <= 0) return 'stay';
    const far = dy >= viewport.height * DISMISS_DISTANCE_RATIO;
    const fast = velocity(dy, elapsedMs) >= DISMISS_VELOCITY && dy >= FLICK_MIN_TRAVEL_PX;
    return far || fast ? 'dismiss' : 'stay';
  }

  return 'stay';
}

/** Carousel step with wrap-around, matching the desktop arrows. */
export function wrapIndex(index: number, total: number, step: number): number {
  if (total <= 0) return 0;
  return ((index + step) % total + total) % total;
}

export function clampScale(scale: number, min: number = MIN_SCALE, max: number = MAX_SCALE): number {
  // A pinch whose start distance was 0 produces NaN; treat that as "unzoomed".
  if (Number.isNaN(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * The box an `object-fit: contain` image actually occupies at scale 1.
 *
 * Pan bounds are derived from the *rendered* size, not the natural one: a
 * 4000px-wide photo letterboxed into a 390px viewport can only be panned by
 * what is really off-screen.
 */
export function fittedSize(natural: Size, viewport: Size): Size {
  if (natural.width <= 0 || natural.height <= 0) return { ...viewport };
  const ratio = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  return { width: natural.width * ratio, height: natural.height * ratio };
}

/** How far, in each direction, a scaled image may be moved from centre. */
export function panBounds(content: Size, viewport: Size, scale: number): Point {
  return {
    x: Math.max(0, (content.width * scale - viewport.width) / 2),
    y: Math.max(0, (content.height * scale - viewport.height) / 2),
  };
}

/** `Math.min`/`Math.max` happily return -0, which leaks into style strings. */
const unsign = (n: number): number => n + 0;

/** Keeps the image's edges from leaving the viewport while panning. */
export function clampPan(offset: Point, content: Size, viewport: Size, scale: number): Point {
  const bound = panBounds(content, viewport, scale);
  return {
    x: unsign(Math.min(bound.x, Math.max(-bound.x, offset.x))),
    y: unsign(Math.min(bound.y, Math.max(-bound.y, offset.y))),
  };
}

/**
 * The offset that keeps `focal` over the same pixel of the image while the
 * scale goes from `from` to `to` — what makes a pinch feel anchored to the
 * fingers instead of to the middle of the screen.
 *
 * Screen position of an image point p is `centre + offset + p·scale`, so
 * holding p fixed gives `offset' = v - (v - offset)·(to/from)` with
 * `v = focal - centre`.
 */
export function focalOffset(offset: Point, focal: Point, centre: Point, from: number, to: number): Point {
  if (from <= 0) return offset;
  const k = to / from;
  const vx = focal.x - centre.x;
  const vy = focal.y - centre.y;
  return {
    x: vx - (vx - offset.x) * k,
    y: vy - (vy - offset.y) * k,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export interface Tap extends Point {
  /** `performance.now()`-style timestamp in ms. */
  t: number;
}

export function isDoubleTap(previous: Tap | null, next: Tap): boolean {
  if (!previous) return false;
  return (
    next.t - previous.t <= DOUBLE_TAP_MS &&
    distance(previous, next) <= DOUBLE_TAP_SLOP_PX
  );
}

/** Double tap toggles: fit → DOUBLE_TAP_SCALE → fit. */
export function toggleScale(scale: number): number {
  return scale > MIN_SCALE + 0.01 ? MIN_SCALE : DOUBLE_TAP_SCALE;
}

/**
 * Scrim opacity while a dismissal drag is in flight. Stays readable — the
 * image never fades to nothing before the finger is lifted.
 */
export function dismissOpacity(dy: number, viewportHeight: number): number {
  if (dy <= 0 || viewportHeight <= 0) return 1;
  const progress = Math.min(1, dy / viewportHeight);
  return Math.max(0.35, 1 - progress * 1.1);
}
