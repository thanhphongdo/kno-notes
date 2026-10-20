'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { BrandKit, Presentation, PresentationMotion } from '@/lib/presentation/schema';
import {
  clampSlideIndex, readViewerPrefs, resolvePresentationView, stepSlideIndex, writeViewerPrefs,
  type BackgroundName, type PrefsStore, type ViewerPrefs,
} from '@/lib/presentation/view';
import type { Theme } from '@/lib/theme';
import type { NoteImage } from '@/lib/types';
import { PresentationBar } from './presentation-bar';
import { PresentationSlide } from './presentation-slide';

/** Thanh điều khiển tự mờ đi sau chừng này khi không ai động tới (chỉ với chuột). */
const IDLE_MS = 3200;
/** Slide đang thoát bị dọn sau chừng này, nếu `animationend` không tới. */
const LEAVE_MS = 420;
/** Vuốt ngang bao nhiêu px thì tính là đổi slide. */
const SWIPE_PX = 48;

export interface PresentationViewerProps {
  presentation: Presentation;
  noteTitle: string;
  /** Để slide `image` tra `imageId` ra đường dẫn ảnh sẵn có của app. */
  images?: readonly NoteImage[];
  /** Lựa chọn cá nhân lưu theo người dùng — nhiều người đăng nhập lần lượt một máy. */
  userId: string;
  onClose: () => void;
  initialIndex?: number;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  /** Chỗ cắm cho test: kho giả thay cho `localStorage`. */
  prefsStore?: PrefsStore | null;
  className?: string;
}

/**
 * Chế độ "xem dạng trình chiếu": toàn màn hình, một slide một lúc.
 *
 * Mọi quyết định hiển thị đi qua `resolvePresentationView`, nên thứ tự ưu tiên
 * chỉ sống ở một chỗ: lựa chọn cá nhân → mặc định của bài → mặc định của mẫu,
 * và `prefers-reduced-motion` thắng tất cả.
 */
export function PresentationViewer({
  presentation, noteTitle, images = [], userId, onClose, initialIndex = 0,
  theme, onThemeChange, prefsStore, className,
}: PresentationViewerProps) {
  const total = presentation.slides.length;
  const [index, setIndex] = useState(() => clampSlideIndex(initialIndex, total));
  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  /**
   * `localStorage` chỉ đọc được ở trình duyệt, nên lần render đầu (và cả bản
   * render trên máy chủ) luôn là "theo bài". Đọc xong thì state cập nhật —
   * cách đó không bao giờ lệch hydration.
   */
  const [prefs, setPrefs] = useState<ViewerPrefs>({});
  useEffect(() => {
    setPrefs(readViewerPrefs(userId, prefsStore));
  }, [userId, prefsStore]);

  const reducedMotion = useReducedMotion();
  const view = useMemo(
    () => resolvePresentationView({ presentation, prefs, reducedMotion }),
    [presentation, prefs, reducedMotion],
  );

  const commitPrefs = useCallback(
    (patch: ViewerPrefs) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        writeViewerPrefs(userId, next, prefsStore);
        return next;
      });
    },
    [userId, prefsStore],
  );

  const resetToNoteDefaults = useCallback(() => {
    setPrefs({});
    writeViewerPrefs(userId, {}, prefsStore);
  }, [userId, prefsStore]);

  /* ── Đánh thức thanh điều khiển ───────────────────────────────────────── */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const fine = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    const events: readonly (keyof WindowEventMap)[] = ['pointermove', 'pointerdown', 'focusin'];
    for (const ev of events) window.addEventListener(ev, wake, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, wake);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);

  /* ── Điều hướng ───────────────────────────────────────────────────────── */
  const goTo = useCallback(
    (next: number, direction: 1 | -1) => {
      const target = clampSlideIndex(next, total);
      if (target !== index) {
        setDir(direction);
        setLeaving({ index, dir: direction });
        setIndex(target);
      }
      wake();
    },
    [index, total, wake],
  );

  const step = useCallback(
    (delta: number) => {
      goTo(stepSlideIndex(index, delta, total), delta > 0 ? 1 : -1);
    },
    [goTo, index, total],
  );

  // Slide cũ được dọn bằng hẹn giờ thay vì `animationend`: bấm nhanh nhiều lần
  // thì slide thoát trước đó phải biến mất ngay, không chồng lớp.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'Escape') {
        e.preventDefault();
        if (optionsOpen) setOptionsOpen(false);
        else onClose();
        return;
      }
      // Trong bảng tuỳ chọn, phím mũi tên thuộc về chính bảng đó.
      if (optionsOpen) return;
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        step(1);
      } else if (k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault();
        step(-1);
      } else if (k === 'Home') {
        e.preventDefault();
        goTo(0, -1);
      } else if (k === 'End') {
        e.preventDefault();
        goTo(total - 1, 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onClose, optionsOpen, step, total]);

  /* ── Vuốt ngang trên điện thoại ───────────────────────────────────────── */
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touch.current;
      const t = e.changedTouches[0];
      touch.current = null;
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    },
    [step],
  );

  /** Thứ tự của từng slide `section` trong các slide `section` — mockup đánh số riêng. */
  const sectionNumbers = useMemo(() => {
    let n = 0;
    return presentation.slides.map((s) => (s.layout === 'section' ? n++ : -1));
  }, [presentation.slides]);

  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  const slide = presentation.slides[index];
  const leavingSlide = leaving ? presentation.slides[leaving.index] : undefined;
  const common = {
    total,
    template: view.template,
    noteTitle,
    pattern: view.pattern,
    motion: view.motion,
    images,
  };

  return (
    <div
      role="region"
      aria-label="Chế độ trình chiếu"
      className={cn('kn-present', className)}
      data-template={view.template}
      data-kit={view.brandKit}
      data-pattern={view.pattern}
      data-motion={view.motion}
      data-idle={idle ? 'true' : 'false'}
      style={{ zIndex: Z.present } as CSSProperties}
    >
      <div className="kn-stage-wrap">
        <div
          ref={stageRef}
          className="kn-stage"
          tabIndex={-1}
          aria-live="polite"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="kn-stage-progress" aria-hidden="true">
            <i style={{ width: `${((index + 1) / Math.max(1, total)) * 100}%` }} />
          </div>

          {leavingSlide && leaving ? (
            <PresentationSlide
              // Khoá mang chỉ số: hai slide cùng tồn tại trong lúc chuyển.
              key={`leave-${leaving.index}`}
              {...common}
              slide={leavingSlide}
              index={leaving.index}
              sectionIndex={Math.max(0, sectionNumbers[leaving.index] ?? 0)}
              phase="leaving"
              dir={leaving.dir}
            />
          ) : null}

          {slide ? (
            <PresentationSlide
              key={`slide-${index}`}
              {...common}
              slide={slide}
              index={index}
              sectionIndex={Math.max(0, sectionNumbers[index] ?? 0)}
              phase="enter"
              dir={dir}
            />
          ) : null}
        </div>
      </div>

      <PresentationBar
        index={index}
        total={total}
        view={view}
        prefsStored={Object.keys(prefs).length > 0}
        optionsOpen={optionsOpen}
        onOptionsOpenChange={setOptionsOpen}
        onStep={step}
        onExit={onClose}
        onBrandKit={(kit: BrandKit) => commitPrefs({ brandKit: kit })}
        onPattern={(pattern: BackgroundName) => commitPrefs({ pattern })}
        onMotion={(motion: PresentationMotion) => commitPrefs({ motion })}
        onResetToNoteDefaults={resetToNoteDefaults}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    </div>
  );
}
