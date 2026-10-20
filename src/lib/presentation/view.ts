// src/lib/presentation/view.ts
//
// Luật của chế độ "xem dạng trình chiếu" ở phía người xem. File này THUẦN:
// không React, không DOM ngoài `localStorage` (và cả chỗ đó cũng nhận store từ
// ngoài để test được), nên mọi quyết định — chọn slide nào, bộ màu nào, nền
// nào, chuyển động nào — đều kiểm được bằng unit test.
//
// Vì sao danh sách nền sống ở ĐÂY mà không import từ `schema.ts`: nguồn dữ
// liệu là LLM, nên `pattern` đọc được từ một ghi chú đã lưu có thể là tên cũ,
// tên bịa, hoặc không có. UI phải chịu được cả ba mà không trang trắng, nên nó
// tự giữ danh sách tên mình vẽ được và coi mọi thứ ngoài danh sách là "thiếu".

import type { BrandKit, Presentation, PresentationMotion, PresentationTemplate } from './schema';
import { META_PREFIX, scopePrefix } from '@/lib/offline/keys';

/* ══ Nền ═══════════════════════════════════════════════════════════════════ */

/**
 * Tám nền chỉ chạm ở rìa: hoa văn nằm ngoài mép, vùng giữa trang trống hoàn
 * toàn cho chữ. Nhóm an toàn nhất để đọc.
 */
export const EDGE_BACKGROUNDS = [
  'corner-brackets',
  'edge-ticks',
  'margin-rule',
  'frame-inset',
  'corner-contour',
  'corner-fan',
  'side-pinstripe',
  'edge-weave',
] as const;

/** Mười hai nền phủ toàn trang nhưng có mặt nạ moi rỗng khu vực chữ. */
export const FIELD_BACKGROUNDS = [
  'paper-fiber',
  'linen-weave',
  'terrain-contour',
  'wave-field',
  'ecg-baseline',
  'concentric-arc',
  'halftone-drift',
  'mesh-wash',
  'color-block',
  'radiograph-grid',
  'stone-vein',
  'bokeh-soft',
] as const;

/** Enum đóng, đúng 20 tên + `none`. Mỗi tên có một rule trong presentation.css. */
export const PRESENTATION_BACKGROUNDS = [
  'none',
  ...EDGE_BACKGROUNDS,
  ...FIELD_BACKGROUNDS,
] as const;

export type BackgroundName = (typeof PRESENTATION_BACKGROUNDS)[number];

const BACKGROUND_SET: ReadonlySet<string> = new Set(PRESENTATION_BACKGROUNDS);

/** `true` chỉ khi tên này app vẽ được. Tên lạ do LLM bịa ra trả `false`. */
export function isBackgroundName(value: unknown): value is BackgroundName {
  return typeof value === 'string' && BACKGROUND_SET.has(value);
}

export const BACKGROUND_LABEL: Record<BackgroundName, string> = {
  none: 'Không',
  'corner-brackets': 'Ngoặc góc',
  'edge-ticks': 'Vạch mép',
  'margin-rule': 'Lề sổ tay',
  'frame-inset': 'Khung thụt',
  'corner-contour': 'Bình độ góc',
  'corner-fan': 'Nan quạt',
  'side-pinstripe': 'Kẻ sọc hai bên',
  'edge-weave': 'Dệt mép',
  'paper-fiber': 'Sớ giấy',
  'linen-weave': 'Vải lanh',
  'terrain-contour': 'Bình độ địa hình',
  'wave-field': 'Sóng nước',
  'ecg-baseline': 'Điện tim',
  'concentric-arc': 'Cung đồng tâm',
  'halftone-drift': 'Chấm bán sắc',
  'mesh-wash': 'Loang màu',
  'color-block': 'Khối màu',
  'radiograph-grid': 'Lưới phim',
  'stone-vein': 'Vân đá',
  'bokeh-soft': 'Vòng sáng',
};

/**
 * Nền mặc định của từng mẫu, dùng khi bộ slide không nói gì (`pattern` vắng
 * mặt nghĩa là "để mẫu tự quyết", theo chú thích của schema). Chọn theo đúng
 * tinh thần ba nền mà mockup gán cho ba mẫu: kẻ dòng · chấm · lưới.
 */
export const TEMPLATE_DEFAULT_BACKGROUND: Record<PresentationTemplate, BackgroundName> = {
  // `margin-rule` nghe đúng tinh thần "lề sổ tay" hơn, nhưng hai nét dọc của
  // nó rơi ngay cạnh vạch kẻ cột chrome của mẫu này và thành ba đường song
  // song. `corner-brackets` là dấu cắt nhà in — vẫn là trang sách, không đụng.
  editorial: 'corner-brackets',
  deck: 'halftone-drift',
  clinical: 'radiograph-grid',
};

/* ══ Nhãn tiếng Việt ══════════════════════════════════════════════════════ */

export const TEMPLATE_LABEL: Record<PresentationTemplate, string> = {
  editorial: 'Biên tập',
  deck: 'Thuyết trình',
  clinical: 'Bệnh án',
};

export const BRAND_KIT_LABEL: Record<BrandKit, string> = {
  mint: 'Bạc hà',
  midnight: 'Nửa đêm',
  paper: 'Giấy',
  clinic: 'Phòng khám',
};

export const MOTION_LABEL: Record<PresentationMotion, string> = {
  full: 'Đầy đủ',
  subtle: 'Nhẹ',
  none: 'Tắt',
};

export const MOTIONS = ['full', 'subtle', 'none'] as const;
export const BRAND_KITS_UI = ['mint', 'midnight', 'paper', 'clinic'] as const;

/* ══ Chỉ số slide ═════════════════════════════════════════════════════════ */

/**
 * Kẹp chỉ số về trong [0, total-1]. `total` bằng 0 trả 0 — nơi gọi vẫn phải
 * tự xử lý bộ slide rỗng, nhưng không ai nhận được -1 hay NaN.
 */
export function clampSlideIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, Math.trunc(index)));
}

/** Đi `delta` slide, kẹp ở hai đầu. Không vòng lại — hết bài là hết bài. */
export function stepSlideIndex(index: number, delta: number, total: number): number {
  return clampSlideIndex(clampSlideIndex(index, total) + delta, total);
}

/** "03 / 11" — số slide luôn hai chữ số như mockup. */
export const slideNumber = (index: number): string => String(index + 1).padStart(2, '0');

/* ══ Lựa chọn của người xem ═══════════════════════════════════════════════ */

export interface ViewerPrefs {
  brandKit?: BrandKit;
  pattern?: BackgroundName;
  motion?: PresentationMotion;
}

/**
 * Một bản ghi duy nhất, scope theo người dùng đúng quy ước của
 * `src/lib/offline/keys.ts` — máy này có thể có nhiều người đăng nhập lần lượt
 * và `localStorage` dùng chung cho cả origin.
 */
export const presentationPrefsKey = (userId: string): string =>
  `${scopePrefix(META_PREFIX, userId)}presentation`;

/** Chỉ cần đúng ba hàm này của `Storage`, nên test truyền vào bản giả được. */
export interface PrefsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function store(explicit?: PrefsStore | null): PrefsStore | null {
  if (explicit) return explicit;
  try {
    // Cửa sổ ẩn danh của Safari đã từng NÉM ngay ở bước đọc thuộc tính này.
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const KITS: ReadonlySet<string> = new Set(BRAND_KITS_UI);
const MOTION_SET: ReadonlySet<string> = new Set(MOTIONS);

/** Lọc từng trường một: một trường rác không được làm mất hai trường còn lại. */
export function sanitizeViewerPrefs(raw: unknown): ViewerPrefs {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: ViewerPrefs = {};
  if (typeof r.brandKit === 'string' && KITS.has(r.brandKit)) out.brandKit = r.brandKit as BrandKit;
  if (isBackgroundName(r.pattern)) out.pattern = r.pattern;
  if (typeof r.motion === 'string' && MOTION_SET.has(r.motion)) out.motion = r.motion as PresentationMotion;
  return out;
}

/**
 * Thiếu giá trị đã lưu nghĩa là "theo bài", KHÔNG phải lỗi: kho trống, JSON
 * hỏng, hay trình duyệt chặn site data đều trả về cùng một thứ — object rỗng.
 */
export function readViewerPrefs(userId: string, explicit?: PrefsStore | null): ViewerPrefs {
  const s = store(explicit);
  if (!s) return {};
  try {
    const raw = s.getItem(presentationPrefsKey(userId));
    return raw ? sanitizeViewerPrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Ghi được thì ghi; không ghi được thì phiên này vẫn chạy đúng, chỉ không nhớ. */
export function writeViewerPrefs(userId: string, prefs: ViewerPrefs, explicit?: PrefsStore | null): void {
  const s = store(explicit);
  if (!s) return;
  try {
    const clean = sanitizeViewerPrefs(prefs);
    if (Object.keys(clean).length === 0) s.removeItem(presentationPrefsKey(userId));
    else s.setItem(presentationPrefsKey(userId), JSON.stringify(clean));
  } catch {
    /* hết dung lượng hoặc bị chặn — không phải lỗi của người đang xem */
  }
}

export function clearViewerPrefs(userId: string, explicit?: PrefsStore | null): void {
  const s = store(explicit);
  if (!s) return;
  try {
    s.removeItem(presentationPrefsKey(userId));
  } catch {
    /* như trên */
  }
}

/* ══ Giải lựa chọn ════════════════════════════════════════════════════════ */

export interface ResolvedView {
  /** Người soạn quyết, và là quyết định cuối — người xem không đổi được. */
  template: PresentationTemplate;
  brandKit: BrandKit;
  pattern: BackgroundName;
  /** Mức áp cho DOM, đã tính cả `prefers-reduced-motion`. */
  motion: PresentationMotion;
  /** Mức người xem đang chọn, trước khi trợ năng can thiệp. */
  motionChoice: PresentationMotion;
  /** `true` khi hệ điều hành đòi giảm chuyển động và đã thắng lựa chọn trên. */
  reducedMotionWins: boolean;
  /** Mặc định của chính bài, để nút "Về mặc định của bài" biết phải về đâu. */
  noteDefaults: { brandKit: BrandKit; pattern: BackgroundName; motion: PresentationMotion };
  overridden: { brandKit: boolean; pattern: boolean; motion: boolean };
  /** `true` khi có ít nhất một trường của người xem đang đè lên mặc định. */
  hasOverride: boolean;
}

export interface ResolveInput {
  presentation: Pick<Presentation, 'template' | 'brandKit'> & {
    pattern?: string | null;
    motion?: PresentationMotion | null;
  };
  prefs?: ViewerPrefs;
  /** Kết quả của `(prefers-reduced-motion: reduce)`. */
  reducedMotion?: boolean;
}

export function resolvePresentationView({
  presentation, prefs = {}, reducedMotion = false,
}: ResolveInput): ResolvedView {
  const template = presentation.template;

  const noteDefaults = {
    brandKit: presentation.brandKit,
    // `pattern` vắng mặt — hoặc là một tên app không vẽ được — nghĩa là để mẫu
    // tự quyết. Không bao giờ là trang trắng, không bao giờ là lỗi.
    pattern: isBackgroundName(presentation.pattern)
      ? presentation.pattern
      : TEMPLATE_DEFAULT_BACKGROUND[template],
    motion: presentation.motion ?? 'full',
  };

  const brandKit = prefs.brandKit ?? noteDefaults.brandKit;
  const pattern = prefs.pattern ?? noteDefaults.pattern;
  const motionChoice = prefs.motion ?? noteDefaults.motion;

  const overridden = {
    brandKit: prefs.brandKit != null && prefs.brandKit !== noteDefaults.brandKit,
    pattern: prefs.pattern != null && prefs.pattern !== noteDefaults.pattern,
    motion: prefs.motion != null && prefs.motion !== noteDefaults.motion,
  };

  return {
    template,
    brandKit,
    pattern,
    // Trợ năng của hệ điều hành LUÔN thắng, kể cả khi người dùng tự chọn `full`.
    motion: reducedMotion ? 'none' : motionChoice,
    motionChoice,
    reducedMotionWins: reducedMotion && motionChoice !== 'none',
    noteDefaults,
    overridden,
    hasOverride: overridden.brandKit || overridden.pattern || overridden.motion,
  };
}

/* ══ Chữ in đậm trong một dòng bullet ═════════════════════════════════════ */

export interface TextRun {
  text: string;
  bold: boolean;
}

const BOLD_RE = /<(b|strong)>([\s\S]*?)<\/\1>/gi;

/**
 * Bộ slide do LLM sinh ra, và mockup dựa vào `<b>…</b>` ở đầu dòng để nhấn ý
 * chính. Cho nguyên chuỗi đó vào `innerHTML` là mở cửa XSS, nên ở đây chỉ
 * `<b>` và `<strong>` được hiểu là định dạng; mọi thẻ khác rơi về chữ thường
 * và React tự thoát nó.
 */
export function splitBoldRuns(text: string): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const m of text.matchAll(BOLD_RE)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ text: text.slice(at, start), bold: false });
    if (m[2]) out.push({ text: m[2], bold: true });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), bold: false });
  return out.length > 0 ? out : [{ text: '', bold: false }];
}

/** Bộ slide dùng được hay không — lối vào trên trang chi tiết hỏi đúng câu này. */
export function hasSlides(presentation: Presentation | null | undefined): presentation is Presentation {
  return Boolean(presentation && presentation.slides.length > 0);
}
