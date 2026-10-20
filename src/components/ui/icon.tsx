import type { JSX, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type IconName =
  | 'search' | 'star' | 'plus' | 'sidebar-open' | 'sidebar-collapse' | 'edit' | 'trash'
  | 'quiz' | 'highlight' | 'history' | 'comment' | 'image' | 'grid' | 'list'
  | 'sun' | 'moon' | 'logout' | 'copy' | 'download'
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'check' | 'close'
  | 'arrow-left' | 'sliders' | 'present'
  // Bộ icon của chế độ trình chiếu (Design Spec trình chiếu §18 icon). `check`,
  // `list` và `clock` KHÔNG có ở đây: ba hình đó app đã vẽ sẵn ở trên
  // (`check`, `list`, `history`) và `slideIcon()` trỏ về đúng chúng — vẽ lại
  // là nhân bản icon, đúng thứ Quy tắc #1 cấm.
  | 'alert' | 'info' | 'question' | 'target' | 'chart' | 'compare' | 'layers'
  | 'book' | 'idea' | 'heart' | 'lungs' | 'bone' | 'scan' | 'stethoscope' | 'pill';

interface IconDef {
  /** Default stroke width, exactly as specified in Design Spec §05. */
  sw: number;
  cap: boolean;
  join: boolean;
  paths: JSX.Element;
}

const STAR_D = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';
const SIDEBAR_D = 'M9.5 4.5v15';

/** Cả 18 icon của slide dùng đúng một nét 1.5 — mockup vẽ thế. */
const SLIDE_SW = 1.5;

const ICONS: Record<IconName, IconDef> = {
  search: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>) },
  star: { sw: 1.6, cap: false, join: true, paths: <path d={STAR_D} /> },
  plus: { sw: 2, cap: true, join: false, paths: <path d="M12 5v14M5 12h14" /> },
  'sidebar-open': { sw: 1.7, cap: true, join: true, paths: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d={SIDEBAR_D} /></>) },
  'sidebar-collapse': { sw: 1.7, cap: true, join: true, paths: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15M16 10l-2 2 2 2" /></>) },
  edit: { sw: 1.8, cap: false, join: true, paths: <path d="M4 20h4L19 9l-4-4L4 16z" /> },
  trash: { sw: 1.7, cap: true, join: true, paths: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /> },
  quiz: { sw: 1.8, cap: true, join: true, paths: (<><path d="M9 11l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="3" /></>) },
  highlight: { sw: 1.8, cap: true, join: true, paths: (<><path d="M14.5 4.5l5 5L10 19H5v-5z" /><path d="M4 22h16" /></>) },
  history: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>) },
  comment: { sw: 1.7, cap: false, join: true, paths: <path d="M4 5h16v11H9l-5 4z" /> },
  image: { sw: 1.7, cap: false, join: true, paths: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" /></>) },
  grid: { sw: 1.8, cap: false, join: true, paths: (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>) },
  list: { sw: 1.8, cap: true, join: false, paths: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
  sun: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
  moon: { sw: 1.8, cap: true, join: true, paths: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /> },
  logout: { sw: 1.7, cap: true, join: true, paths: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /> },
  copy: { sw: 1.7, cap: true, join: true, paths: (<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 9V4H4v11h5" /></>) },
  download: { sw: 1.7, cap: true, join: true, paths: <path d="M12 4v11M8 11l4 4 4-4M5 19h14" /> },
  'chevron-left': { sw: 1.8, cap: true, join: true, paths: <path d="M15 6l-6 6 6 6" /> },
  'chevron-right': { sw: 1.8, cap: true, join: true, paths: <path d="M9 6l6 6-6 6" /> },
  'chevron-down': { sw: 2, cap: true, join: true, paths: <path d="M6 9l6 6 6-6" /> },
  check: { sw: 2.2, cap: true, join: true, paths: <path d="M5 12l5 5 9-10" /> },
  close: { sw: 1.8, cap: true, join: false, paths: <path d="M6 6l12 12M18 6L6 18" /> },
  'arrow-left': { sw: 1.7, cap: true, join: true, paths: <path d="M19 12H5M11 18l-6-6 6-6" /> },
  sliders: {
    sw: 1.7, cap: true, join: true,
    paths: (<><path d="M4 7h10M18 7h2M4 17h6M14 17h6M4 12h2M10 12h10" /><circle cx="16" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><circle cx="8" cy="12" r="2" /></>),
  },
  present: {
    sw: 1.7, cap: true, join: true,
    paths: (<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
  },

  // ── 18 icon của slide ───────────────────────────────────────────────────
  // Lấy nguyên path từ mockup: 24×24, fill none, stroke currentColor,
  // stroke-width 1.5, cap/join round.
  alert: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="M12 4.4 2.9 19.6h18.2L12 4.4Z" /><path d="M12 10v4.1" /><path d="M12 17.3h.01" /></>) },
  info: { sw: SLIDE_SW, cap: true, join: true, paths: (<><circle cx="12" cy="12" r="8.6" /><path d="M12 11.3v5.1" /><path d="M12 8.1h.01" /></>) },
  question: { sw: SLIDE_SW, cap: true, join: true, paths: (<><circle cx="12" cy="12" r="8.6" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3 3.1v1.3" /><path d="M12.6 17h.01" /></>) },
  target: { sw: SLIDE_SW, cap: true, join: true, paths: (<><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.2" /><path d="M12 12h.01" /></>) },
  chart: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="M4.2 4v16h15.6" /><path d="M8.2 20v-6.2" /><path d="M12.4 20V8.6" /><path d="M16.6 20v-3.6" /></>) },
  compare: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="M3.6 8.6h13.2l-3.7-3.7" /><path d="M20.4 15.4H7.2l3.7 3.7" /></>) },
  layers: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="m12 3.3 8.3 4.5L12 12.3 3.7 7.8 12 3.3Z" /><path d="m4.4 12 7.6 4.1 7.6-4.1" /><path d="m4.4 16.1 7.6 4.1 7.6-4.1" /></>) },
  book: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="M12 7.1C10.3 5.6 7.9 5.1 4 5.2v12.4c3.9-.1 6.3.4 8 1.9 1.7-1.5 4.1-2 8-1.9V5.2c-3.9-.1-6.3.4-8 1.9Z" /><path d="M12 7.1v12.4" /></>) },
  idea: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="M8.5 14.5a5.6 5.6 0 1 1 7 0c-.8.7-1.2 1.5-1.3 2.4H9.8c-.1-.9-.5-1.7-1.3-2.4Z" /><path d="M10 19.7h4" /></>) },
  heart: { sw: SLIDE_SW, cap: true, join: true, paths: <path d="M12 20.2S3.7 15.3 3.7 9.6A4.55 4.55 0 0 1 12 7a4.55 4.55 0 0 1 8.3 2.6c0 5.7-8.3 10.6-8.3 10.6Z" /> },
  // phổi: khí quản + chỗ chia đôi + hai thuỳ
  lungs: {
    sw: SLIDE_SW, cap: true, join: true,
    paths: (<><path d="M10.6 3.9h2.8" /><path d="M12 4.2v5.3" /><path d="m12 9.5-2 1.3" /><path d="m12 9.5 2 1.3" /><path d="M10 10.8c-1.8 1.1-4.9 3.8-5.5 6.9-.3 1.7.2 2.9 1.5 3.2 1.7.4 3.5-.8 4.1-2.4.3-1 .4-2.1.4-3.2v-3.2c0-.8-.2-1.3-.5-1.3Z" /><path d="M14 10.8c1.8 1.1 4.9 3.8 5.5 6.9.3 1.7-.2 2.9-1.5 3.2-1.7.4-3.5-.8-4.1-2.4-.3-1-.4-2.1-.4-3.2v-3.2c0-.8.2-1.3.5-1.3Z" /></>),
  },
  // xương: thân xương hai nét + hai đầu lồi cầu
  bone: {
    sw: SLIDE_SW, cap: true, join: true,
    paths: (<><circle cx="5.9" cy="16.3" r="2.1" /><circle cx="7.7" cy="18.1" r="2.1" /><circle cx="18.1" cy="7.7" r="2.1" /><circle cx="16.3" cy="5.9" r="2.1" /><path d="M7.3 14.7 14.7 7.3" /><path d="M9.3 16.7 16.7 9.3" /></>),
  },
  // quét phim: bốn góc ngoặc + vạch quét
  scan: {
    sw: SLIDE_SW, cap: true, join: true,
    paths: (<><path d="M4 8.6V6.2a2.2 2.2 0 0 1 2.2-2.2h2.4" /><path d="M20 8.6V6.2A2.2 2.2 0 0 0 17.8 4h-2.4" /><path d="M4 15.4v2.4A2.2 2.2 0 0 0 6.2 20h2.4" /><path d="M20 15.4v2.4a2.2 2.2 0 0 1-2.2 2.2h-2.4" /><path d="M3.4 12h17.2" /></>),
  },
  // ống nghe: hai tai nghe, dây chữ Y, loa nghe
  stethoscope: {
    sw: SLIDE_SW, cap: true, join: true,
    paths: (<><path d="M4.4 4.1h2.2" /><path d="M12.6 4.1h2.2" /><path d="M5.5 4.1v4.3a4.1 4.1 0 0 0 8.2 0V4.1" /><path d="M9.6 12.6v2.3a4.5 4.5 0 0 0 9 0v-1.6" /><circle cx="18.6" cy="11.2" r="2" /></>),
  },
  pill: { sw: SLIDE_SW, cap: true, join: true, paths: (<><path d="m10.5 20.4 9.9-9.9a4.9 4.9 0 1 0-6.9-6.9l-9.9 9.9a4.9 4.9 0 1 0 6.9 6.9Z" /><path d="m8.5 8.5 7 7" /></>) },
};

export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName;
  /**
   * Rendered size (width = height). Default 16 (px).
   *
   * Nhận cả chuỗi CSS vì icon trong slide phải co theo cỡ chữ của ô chứa:
   * sân khấu đo mọi thứ bằng `cqi`, nên một con số px cố định sẽ sai ở mọi
   * kích thước màn hình trừ một.
   */
  size?: number | string;
  /** Overrides the per-icon default stroke width. */
  strokeWidth?: number;
  /** Fills the shape with currentColor. Only meaningful for `star`. Default false. */
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth, filled = false, className, ...rest }: IconProps) {
  const def = ICONS[name];
  const labelled = rest['aria-label'] != null || rest['aria-labelledby'] != null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth ?? def.sw}
      strokeLinecap={def.cap ? 'round' : undefined}
      strokeLinejoin={def.join ? 'round' : undefined}
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      {def.paths}
    </svg>
  );
}
