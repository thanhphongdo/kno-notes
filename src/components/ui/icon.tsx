import type { JSX, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type IconName =
  | 'search' | 'star' | 'plus' | 'sidebar-open' | 'sidebar-collapse' | 'edit' | 'trash'
  | 'quiz' | 'highlight' | 'history' | 'comment' | 'image' | 'grid' | 'list'
  | 'sun' | 'moon' | 'logout'
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'check' | 'close';

interface IconDef {
  /** Default stroke width, exactly as specified in Design Spec §05. */
  sw: number;
  cap: boolean;
  join: boolean;
  paths: JSX.Element;
}

const STAR_D = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';
const SIDEBAR_D = 'M9.5 4.5v15';

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
  'chevron-left': { sw: 1.8, cap: true, join: true, paths: <path d="M15 6l-6 6 6 6" /> },
  'chevron-right': { sw: 1.8, cap: true, join: true, paths: <path d="M9 6l6 6-6 6" /> },
  'chevron-down': { sw: 2, cap: true, join: true, paths: <path d="M6 9l6 6 6-6" /> },
  check: { sw: 2.2, cap: true, join: true, paths: <path d="M5 12l5 5 9-10" /> },
  close: { sw: 1.8, cap: true, join: false, paths: <path d="M6 6l12 12M18 6L6 18" /> },
};

export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName;
  /** Rendered px size (width = height). Default 16. */
  size?: number;
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
