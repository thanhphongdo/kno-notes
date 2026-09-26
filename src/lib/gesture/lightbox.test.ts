import { describe, expect, it } from 'vitest';
import {
  AXIS_LOCK_PX, DOUBLE_TAP_SCALE, MAX_SCALE, MIN_SCALE,
  clampPan, clampScale, dismissOpacity, distance, fittedSize, focalOffset, isDoubleTap,
  lockAxis, midpoint, panBounds, resolveRelease, toggleScale, wrapIndex,
  type ReleaseInput,
} from './lightbox';

const VIEWPORT = { width: 390, height: 844 };

const release = (patch: Partial<ReleaseInput> = {}): ReleaseInput => ({
  axis: 'x',
  dx: 0,
  dy: 0,
  elapsedMs: 200,
  viewport: VIEWPORT,
  canSwipe: true,
  canDismiss: true,
  ...patch,
});

describe('lockAxis', () => {
  it('stays undecided inside the lock threshold', () => {
    expect(lockAxis(0, 0)).toBe('none');
    expect(lockAxis(AXIS_LOCK_PX - 1, AXIS_LOCK_PX - 1)).toBe('none');
  });

  it('locks to the dominant axis once the threshold is crossed', () => {
    expect(lockAxis(40, 6)).toBe('x');
    expect(lockAxis(-40, 6)).toBe('x');
    expect(lockAxis(6, 40)).toBe('y');
    expect(lockAxis(6, -40)).toBe('y');
  });

  it('breaks a perfect diagonal towards the horizontal swipe', () => {
    expect(lockAxis(30, 30)).toBe('x');
  });

  it('accepts a custom threshold', () => {
    expect(lockAxis(5, 0, 4)).toBe('x');
    expect(lockAxis(5, 0, 60)).toBe('none');
  });
});

describe('resolveRelease — horizontal', () => {
  it('springs back for a short, slow drag', () => {
    expect(resolveRelease(release({ dx: -30, elapsedMs: 900 }))).toBe('stay');
  });

  it('advances past a fifth of the viewport width', () => {
    expect(resolveRelease(release({ dx: -100, elapsedMs: 900 }))).toBe('next');
    expect(resolveRelease(release({ dx: 100, elapsedMs: 900 }))).toBe('prev');
  });

  it('advances on a fast flick that never travelled far', () => {
    expect(resolveRelease(release({ dx: -40, elapsedMs: 60 }))).toBe('next');
  });

  it('ignores a flick too small to be deliberate', () => {
    expect(resolveRelease(release({ dx: -8, elapsedMs: 10 }))).toBe('stay');
  });

  it('springs back when there is only one image', () => {
    expect(resolveRelease(release({ dx: -200, canSwipe: false }))).toBe('stay');
  });

  it('ignores the vertical component once locked to x', () => {
    expect(resolveRelease(release({ dx: -200, dy: 400 }))).toBe('next');
  });
});

describe('resolveRelease — vertical', () => {
  it('dismisses past a fifth of the viewport height', () => {
    expect(resolveRelease(release({ axis: 'y', dy: 200, elapsedMs: 900 }))).toBe('dismiss');
  });

  it('dismisses on a fast downward flick', () => {
    expect(resolveRelease(release({ axis: 'y', dy: 40, elapsedMs: 50 }))).toBe('dismiss');
  });

  it('springs back for a short, slow pull', () => {
    expect(resolveRelease(release({ axis: 'y', dy: 40, elapsedMs: 900 }))).toBe('stay');
  });

  it('never dismisses upwards', () => {
    expect(resolveRelease(release({ axis: 'y', dy: -600, elapsedMs: 50 }))).toBe('stay');
  });

  it('never dismisses while zoomed in', () => {
    expect(resolveRelease(release({ axis: 'y', dy: 600, canDismiss: false }))).toBe('stay');
  });
});

describe('resolveRelease — undecided', () => {
  it('does nothing when the axis never locked', () => {
    expect(resolveRelease(release({ axis: 'none', dx: 500, dy: 500 }))).toBe('stay');
  });
});

describe('wrapIndex', () => {
  it('wraps in both directions', () => {
    expect(wrapIndex(0, 3, 1)).toBe(1);
    expect(wrapIndex(2, 3, 1)).toBe(0);
    expect(wrapIndex(0, 3, -1)).toBe(2);
  });

  it('survives an empty gallery', () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});

describe('clampScale', () => {
  it('holds the 1×–4× bounds', () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('falls back to the minimum for a degenerate pinch', () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE);
  });
});

describe('fittedSize', () => {
  it('letterboxes a wide image into a tall viewport', () => {
    expect(fittedSize({ width: 800, height: 600 }, VIEWPORT)).toEqual({ width: 390, height: 292.5 });
  });

  it('pillarboxes a tall image', () => {
    expect(fittedSize({ width: 600, height: 1600 }, VIEWPORT)).toEqual({ width: 316.5, height: 844 });
  });

  it('falls back to the viewport before the image has loaded', () => {
    expect(fittedSize({ width: 0, height: 0 }, VIEWPORT)).toEqual(VIEWPORT);
  });
});

describe('panBounds / clampPan', () => {
  const content = { width: 390, height: 292.5 };

  it('is pinned at fit scale', () => {
    expect(panBounds(content, VIEWPORT, 1)).toEqual({ x: 0, y: 0 });
    expect(clampPan({ x: 120, y: -80 }, content, VIEWPORT, 1)).toEqual({ x: 0, y: 0 });
  });

  it('only allows movement along the axis that actually overflows', () => {
    // 2× of a 390×292.5 box inside 390×844: wider than the viewport, still shorter.
    expect(panBounds(content, VIEWPORT, 2)).toEqual({ x: 195, y: 0 });
  });

  it('clamps a pan to the overflowing half', () => {
    expect(clampPan({ x: 400, y: 0 }, content, VIEWPORT, 2)).toEqual({ x: 195, y: 0 });
    expect(clampPan({ x: -400, y: 0 }, content, VIEWPORT, 2)).toEqual({ x: -195, y: 0 });
    expect(clampPan({ x: 40, y: 0 }, content, VIEWPORT, 2)).toEqual({ x: 40, y: 0 });
  });

  it('allows vertical pan once the image is taller than the viewport', () => {
    const tall = { width: 316.5, height: 844 };
    expect(panBounds(tall, VIEWPORT, 2)).toEqual({ x: 121.5, y: 422 });
  });
});

describe('focalOffset', () => {
  const centre = { x: 195, y: 422 };

  it('leaves the centre alone when the pinch is centred', () => {
    expect(focalOffset({ x: 0, y: 0 }, centre, centre, 1, 2)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the pinched pixel under the fingers', () => {
    const focal = { x: 295, y: 422 };
    const next = focalOffset({ x: 0, y: 0 }, focal, centre, 1, 2);
    // The point sat 100px right of centre at 1×; at 2× it is 200px out, so the
    // image has to move 100px left to leave it where it was.
    expect(next.x).toBeCloseTo(-100);
    expect(next.y).toBeCloseTo(0);
  });

  it('is reversible', () => {
    const focal = { x: 40, y: 700 };
    const out = focalOffset({ x: 0, y: 0 }, focal, centre, 1, 3);
    expect(focalOffset(out, focal, centre, 3, 1).x).toBeCloseTo(0);
    expect(focalOffset(out, focal, centre, 3, 1).y).toBeCloseTo(0);
  });

  it('ignores a zero starting scale instead of dividing by it', () => {
    expect(focalOffset({ x: 5, y: 6 }, centre, centre, 0, 2)).toEqual({ x: 5, y: 6 });
  });
});

describe('pinch helpers', () => {
  it('measures distance and midpoint', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe('isDoubleTap / toggleScale', () => {
  it('needs a previous tap', () => {
    expect(isDoubleTap(null, { x: 0, y: 0, t: 100 })).toBe(false);
  });

  it('pairs two taps close in time and space', () => {
    expect(isDoubleTap({ x: 10, y: 10, t: 0 }, { x: 14, y: 12, t: 200 })).toBe(true);
  });

  it('rejects taps too far apart in time or space', () => {
    expect(isDoubleTap({ x: 10, y: 10, t: 0 }, { x: 14, y: 12, t: 900 })).toBe(false);
    expect(isDoubleTap({ x: 10, y: 10, t: 0 }, { x: 300, y: 12, t: 100 })).toBe(false);
  });

  it('toggles between fit and the double-tap scale', () => {
    expect(toggleScale(1)).toBe(DOUBLE_TAP_SCALE);
    expect(toggleScale(DOUBLE_TAP_SCALE)).toBe(MIN_SCALE);
    expect(toggleScale(3.9)).toBe(MIN_SCALE);
  });
});

describe('dismissOpacity', () => {
  it('is opaque until the drag starts downward', () => {
    expect(dismissOpacity(0, 844)).toBe(1);
    expect(dismissOpacity(-200, 844)).toBe(1);
  });

  it('fades with the drag but never disappears', () => {
    expect(dismissOpacity(84, 844)).toBeLessThan(1);
    expect(dismissOpacity(844, 844)).toBe(0.35);
  });

  it('survives a zero-height viewport', () => {
    expect(dismissOpacity(100, 0)).toBe(1);
  });
});
