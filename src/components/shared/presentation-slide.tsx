'use client';

import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName as UiIconName } from '@/components/ui/icon';
import {
  bulletItem, type Bullet, type IconName, type Presentation, type PresentationMotion,
  type PresentationTemplate, type Slide, type SlideColumn,
} from '@/lib/presentation/schema';
import {
  slideNumber, splitBoldRuns, type BackgroundName,
} from '@/lib/presentation/view';
import type { NoteImage } from '@/lib/types';

/**
 * Mười tám tên icon của schema nối sang bộ icon của app. Ba tên `check`,
 * `list` và `clock` trỏ về hình app đã có (`check`, `list`, `history`) —
 * những hình đó giống hệt bản trong mockup, và vẽ lại chúng dưới tên mới là
 * nhân bản icon.
 */
export const SLIDE_ICON: Record<IconName, UiIconName> = {
  alert: 'alert',
  check: 'check',
  info: 'info',
  question: 'question',
  target: 'target',
  clock: 'history',
  chart: 'chart',
  compare: 'compare',
  layers: 'layers',
  list: 'list',
  book: 'book',
  idea: 'idea',
  heart: 'heart',
  lungs: 'lungs',
  bone: 'bone',
  scan: 'scan',
  stethoscope: 'stethoscope',
  pill: 'pill',
};

/** Cả 18 icon của slide vẽ ở nét 1.5 và ăn theo `font-size` của ô chứa. */
const SLIDE_ICON_SW = 1.5;

function SlideIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <Icon name={SLIDE_ICON[name]} size="1em" strokeWidth={SLIDE_ICON_SW} className={className} />
  );
}

/** Đếm thứ tự các phần trong một frame để CSS giãn nhịp vào bằng `--d`. */
function animSeq() {
  let d = 0;
  return (): { 'data-anim': string; style: CSSProperties } => ({
    'data-anim': '',
    style: { '--d': d++ } as CSSProperties,
  });
}

type Seq = ReturnType<typeof animSeq>;

function BoldRuns({ text }: { text: string }) {
  return (
    <>
      {splitBoldRuns(text).map((run, i) =>
        run.bold ? <b key={i}>{run.text}</b> : <span key={i}>{run.text}</span>,
      )}
    </>
  );
}

function BulletList({
  items, seq, single = false,
}: { items: readonly Bullet[]; seq: Seq; single?: boolean }) {
  return (
    <ul className={cn('kn-bullets', single && 'kn-bullets--single')}>
      {items.map((raw, i) => {
        const { text, icon } = bulletItem(raw);
        const part = seq();
        return (
          <li key={i} {...part}>
            {icon ? (
              <span className="kn-b-mark kn-b-mark--icon" aria-hidden="true">
                <SlideIcon name={icon} />
              </span>
            ) : (
              <span className="kn-b-mark" aria-hidden="true">
                <span>{slideNumber(i)}</span>
              </span>
            )}
            <span className="kn-b-text">
              <BoldRuns text={text} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Column({ column, seq }: { column: SlideColumn; seq: Seq }) {
  return (
    <div className="kn-col" {...seq()}>
      {column.heading ? <h3 className="kn-col-head">{column.heading}</h3> : null}
      <BulletList items={column.bullets} seq={seq} />
    </div>
  );
}

/**
 * Con số của slide `stat` đếm lên — chỉ ở mức "Đầy đủ", dưới 450 ms.
 * Giá trị thật luôn là nội dung ban đầu, nên khi tắt chuyển động (hoặc khi
 * `prefers-reduced-motion` thắng) slide hiện đúng con số ngay từ khung đầu.
 */
const COUNT_UP_MS = 420;

function StatValue({ value, seq, animate }: { value: string; seq: Seq; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const part = seq();

  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const m = /^(\D*)(\d+(?:[.,]\d+)?)(\D*)$/.exec(value.trim());
    if (!m) return;
    const [, pre, raw, post] = m;
    const sep = raw.includes(',') ? ',' : '.';
    const dec = raw.split(/[.,]/)[1]?.length ?? 0;
    const end = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(end)) return;

    let frame = 0;
    const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_UP_MS);
      el.textContent = pre + (end * ease(k)).toFixed(dec).replace('.', sep) + post;
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = value;
    };
  }, [animate, value]);

  return (
    <div ref={ref} className="kn-stat-value" {...part}>
      {value}
    </div>
  );
}

function Film({ slide, images, seq }: { slide: Slide & { layout: 'image' }; images: readonly NoteImage[]; seq: Seq }) {
  const image = images.find((im) => im.id === slide.imageId);
  return (
    <figure className="kn-film" {...seq()}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.src} alt={image.label || slide.caption || ''} />
      ) : (
        // Ảnh đã bị xoá khỏi ghi chú, hoặc `imageId` do LLM bịa ra. Ô phim vẫn
        // giữ chỗ để bố cục không co lại và slide không bao giờ là trang trắng.
        <div className="kn-film-missing">Ảnh không còn trong ghi chú</div>
      )}
    </figure>
  );
}

function Frame({
  slide, seq, images, sectionIndex, motion,
}: {
  slide: Slide;
  seq: Seq;
  images: readonly NoteImage[];
  sectionIndex: number;
  motion: PresentationMotion;
}): ReactNode {
  switch (slide.layout) {
    case 'title':
      return (
        <>
          {slide.kicker ? <p className="kn-kicker" {...seq()}>{slide.kicker}</p> : null}
          <h1 className="kn-title" {...seq()}>{slide.title}</h1>
          {slide.subtitle ? <p className="kn-sub" {...seq()}>{slide.subtitle}</p> : null}
        </>
      );
    case 'end':
      return (
        <>
          <h2 className="kn-title" {...seq()}>{slide.title}</h2>
          {slide.subtitle ? <p className="kn-sub" {...seq()}>{slide.subtitle}</p> : null}
        </>
      );
    case 'section':
      return (
        <>
          <span className="kn-sec-index" {...seq()}>{slideNumber(sectionIndex)}</span>
          <h2 className="kn-title" {...seq()}>{slide.title}</h2>
        </>
      );
    case 'bullets':
      return (
        <>
          <h2 className="kn-title" {...seq()}>{slide.title}</h2>
          <BulletList items={slide.bullets} seq={seq} />
        </>
      );
    case 'two-col':
      return (
        <>
          <h2 className="kn-title" {...seq()}>{slide.title}</h2>
          <div className="kn-cols">
            <Column column={slide.left} seq={seq} />
            <Column column={slide.right} seq={seq} />
          </div>
        </>
      );
    case 'image':
      return (
        <>
          {slide.title ? <h2 className="kn-title" {...seq()}>{slide.title}</h2> : null}
          <div className="kn-media">
            <Film slide={slide} images={images} seq={seq} />
            <div>
              {slide.bullets && slide.bullets.length > 0 ? (
                <BulletList items={slide.bullets} seq={seq} single />
              ) : null}
              {slide.caption ? <p className="kn-cap" {...seq()}>{slide.caption}</p> : null}
            </div>
          </div>
        </>
      );
    case 'quote':
      return (
        <blockquote className="kn-quote">
          <p className="kn-q-text" {...seq()}>
            {/* Từng từ một: ở mức "Đầy đủ" chữ hiện dần theo dòng đọc. */}
            {slide.text.split(' ').map((word, i) => (
              <Fragment key={i}>
                {i === 0 ? null : ' '}
                <span className="kn-w" style={{ '--w': i } as CSSProperties}>
                  {word}
                </span>
              </Fragment>
            ))}
          </p>
          {slide.attribution ? (
            <footer className="kn-q-at" {...seq()}>{slide.attribution}</footer>
          ) : null}
        </blockquote>
      );
    case 'stat':
      return (
        <div className="kn-stat">
          <StatValue value={slide.value} seq={seq} animate={motion === 'full'} />
          <div className="kn-stat-label" {...seq()}>{slide.label}</div>
          {slide.support ? <p className="kn-stat-support" {...seq()}>{slide.support}</p> : null}
        </div>
      );
    default:
      return null;
  }
}

export interface PresentationSlideProps {
  slide: Slide;
  /** Chỉ số 0-based trong bộ slide. */
  index: number;
  total: number;
  template: PresentationTemplate;
  brandKit?: Presentation['brandKit'];
  /** Tên bài, hiện ở chrome của slide. */
  noteTitle: string;
  pattern: BackgroundName;
  motion: PresentationMotion;
  /** Thứ tự 0-based của slide `section` này trong các slide `section`. */
  sectionIndex?: number;
  images?: readonly NoteImage[];
  /** `enter` khi vừa vào, `leaving` khi đang thoát — CSS lo phần còn lại. */
  phase?: 'enter' | 'leaving';
  /** 1 = đi tiếp, -1 = đi lui. Mẫu "Thuyết trình" đẩy ngang theo hướng này. */
  dir?: 1 | -1;
  className?: string;
}

/**
 * MỘT slide. Không biết gì về điều hướng, bộ màu hay `localStorage` — nhận
 * mọi quyết định qua prop, nên dùng lại được cho cả sân khấu, ô xem trước và
 * test render.
 */
export function PresentationSlide({
  slide, index, total, template, noteTitle, pattern, motion,
  sectionIndex = 0, images = [], phase = 'enter', dir = 1, className,
}: PresentationSlideProps) {
  const seq = animSeq();
  const n = slideNumber(index);
  const icon = 'icon' in slide ? slide.icon : undefined;

  return (
    <article
      className={cn('kn-slide', phase === 'enter' ? 'kn-enter' : 'kn-leaving', className)}
      data-layout={slide.layout}
      style={{ '--dir': dir } as CSSProperties}
    >
      {pattern === 'none' ? null : <div className="kn-bg" data-pattern={pattern} aria-hidden="true" />}

      <div className="kn-chrome" aria-hidden="true">
        <span className="kn-chrome-lead">
          {icon ? <SlideIcon name={icon} className="kn-chrome-ico" /> : null}
          <span className="kn-chrome-note">{noteTitle}</span>
        </span>
        <span className="kn-chrome-index">{template === 'deck' ? `${n} / ${total}` : n}</span>
      </div>

      <div className="kn-frame">
        <Frame slide={slide} seq={seq} images={images} sectionIndex={sectionIndex} motion={motion} />
      </div>
    </article>
  );
}
