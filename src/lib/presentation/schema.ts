// src/lib/presentation/schema.ts
// Hợp đồng dữ liệu của chế độ "xem dạng trình chiếu". File này THUẦN: không
// import db, storage hay domain type, để cả server, route `/api/v1`, MCP và
// trình duyệt đều dùng đúng một bộ luật.
//
// Nguồn dữ liệu là LLM (Codex/Claude đọc PDF/DOCX rồi sinh JSON), nên mọi
// chuỗi đều có trần độ dài: một slide tràn chữ không chỉ xấu, nó còn làm
// phình file JSON của ghi chú và đẩy nó qua giới hạn 1 MB của Contents API.
import { z } from 'zod';

export const PRESENTATION_TEMPLATES = ['editorial', 'deck', 'clinical'] as const;
export const BRAND_KITS = ['mint', 'midnight', 'paper', 'clinic'] as const;

/** Trần số slide — đủ cho một bài giảng dài, vẫn gói trong một file JSON. */
export const MAX_SLIDES = 60;
/** Trần số gạch đầu dòng của layout `bullets`; quá số này là viết bài, không phải slide. */
export const MAX_BULLETS = 8;
/** Mỗi cột của `two-col` hẹp bằng nửa khung nên trần thấp hơn `bullets`. */
export const MAX_COLUMN_BULLETS = 6;

/**
 * Bộ icon đóng. Đóng chứ không phải chuỗi tự do vì mỗi tên ứng với MỘT SVG có
 * thật trong app — tên lạ thì slide hiện ô trống, mà nguồn dữ liệu lại là LLM.
 */
export const ICON_NAMES = [
  'alert',
  'check',
  'info',
  'question',
  'target',
  'clock',
  'chart',
  'compare',
  'layers',
  'list',
  'book',
  'idea',
  'heart',
  'lungs',
  'bone',
  'scan',
  'stethoscope',
  'pill',
] as const;

/**
 * Hoa văn nền. Thiếu = để template tự quyết, nên KHÔNG có `.default()`.
 *
 * Thứ tự KHÔNG phải tình cờ: tám tên đầu (`corner-brackets` → `edge-weave`) là
 * nhóm "rìa" — hoa văn chỉ chạm mép và góc, giữa trang trống hoàn toàn nên
 * chữ đặt lên bao nhiêu cũng được. Mười hai tên sau là nhóm "phủ" — có mặt nạ
 * moi rỗng vùng chữ. UI dựa vào lằn ranh này để biết cần mặt nạ hay không, nên
 * thêm tên mới phải thêm vào đúng nhóm của nó.
 */
export const PRESENTATION_PATTERNS = [
  'none',
  // Nhóm "rìa" — 8 mẫu.
  'corner-brackets',
  'edge-ticks',
  'margin-rule',
  'frame-inset',
  'corner-contour',
  'corner-fan',
  'side-pinstripe',
  'edge-weave',
  // Nhóm "phủ" — 12 mẫu, cần mặt nạ vùng chữ.
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

/** Mức chuyển động. Thiếu = `full`, do nơi dựng UI quyết định, không phải schema. */
export const PRESENTATION_MOTIONS = ['full', 'subtle', 'none'] as const;

export const PresentationTemplateSchema = z.enum(PRESENTATION_TEMPLATES);
export const IconNameSchema = z.enum(ICON_NAMES);
export const PresentationPatternSchema = z.enum(PRESENTATION_PATTERNS);
export const PresentationMotionSchema = z.enum(PRESENTATION_MOTIONS);
export const BrandKitSchema = z.enum(BRAND_KITS);

const title = z.string().min(1).max(200);
const subtitle = z.string().min(1).max(300);
const bullet = z.string().min(1).max(300);

/**
 * Một gạch đầu dòng viết được hai cách: chuỗi trần như trước, hoặc object khi
 * cần icon. Dạng chuỗi phải còn hợp lệ — mọi bộ slide đã lưu đều viết thế, và
 * nó vẫn là cách dùng bình thường khi dòng đó không cần điểm nhấn.
 */
export const BulletSchema = z.union([
  bullet,
  z.object({ text: bullet, icon: IconNameSchema.optional() }),
]);

const bullets = z.array(BulletSchema).min(1).max(MAX_BULLETS);
const columnBullets = z.array(BulletSchema).min(1).max(MAX_COLUMN_BULLETS);

/** Icon ở cấp slide — điểm nhấn cạnh tiêu đề, luôn tuỳ chọn. */
const slideIcon = IconNameSchema.optional();

/**
 * `imageId` phải trỏ tới một ảnh trong `note.images`. Id do app sinh nên luôn
 * khớp mẫu này; chặn tại đây để một id do LLM bịa ra không bao giờ đi tiếp
 * vào đường dẫn storage.
 */
const imageId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'imageId chỉ gồm chữ, số, dấu gạch ngang và gạch dưới.');

const ColumnSchema = z.object({
  heading: z.string().min(1).max(120).optional(),
  bullets: columnBullets,
});

export const SlideSchema = z.discriminatedUnion('layout', [
  z.object({
    layout: z.literal('title'),
    title,
    subtitle: subtitle.optional(),
    kicker: z.string().min(1).max(80).optional(),
    icon: slideIcon,
  }),
  z.object({ layout: z.literal('section'), title, icon: slideIcon }),
  z.object({ layout: z.literal('bullets'), title, bullets, icon: slideIcon }),
  z.object({
    layout: z.literal('two-col'),
    title,
    left: ColumnSchema,
    right: ColumnSchema,
  }),
  z.object({
    layout: z.literal('image'),
    title: title.optional(),
    imageId,
    caption: z.string().min(1).max(300).optional(),
    bullets: columnBullets.optional(),
  }),
  z.object({
    layout: z.literal('quote'),
    text: z.string().min(1).max(600),
    attribution: z.string().min(1).max(160).optional(),
  }),
  z.object({
    layout: z.literal('stat'),
    // Con số đứng một mình, cỡ chữ rất lớn — "1.250.000 ca/năm" vẫn vừa 24 ký tự.
    value: z.string().min(1).max(24),
    label: z.string().min(1).max(160),
    support: z.string().min(1).max(300).optional(),
    icon: slideIcon,
  }),
  z.object({
    layout: z.literal('end'),
    title,
    subtitle: subtitle.optional(),
    icon: slideIcon,
  }),
]);

export const PresentationSchema = z.object({
  template: PresentationTemplateSchema,
  brandKit: BrandKitSchema,
  pattern: PresentationPatternSchema.optional(),
  motion: PresentationMotionSchema.optional(),
  slides: z.array(SlideSchema).min(1).max(MAX_SLIDES),
});

export type PresentationTemplate = (typeof PRESENTATION_TEMPLATES)[number];
export type BrandKit = (typeof BRAND_KITS)[number];
export type IconName = (typeof ICON_NAMES)[number];
export type PresentationPattern = (typeof PRESENTATION_PATTERNS)[number];
export type PresentationMotion = (typeof PRESENTATION_MOTIONS)[number];
export type Bullet = z.infer<typeof BulletSchema>;
export type SlideColumn = z.infer<typeof ColumnSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type SlideLayout = Slide['layout'];
export type Presentation = z.infer<typeof PresentationSchema>;

/** Đúng thứ tự khai báo trong `SlideSchema` — dùng cho mô tả tool và UI chọn layout. */
export const SLIDE_LAYOUTS = [
  'title',
  'section',
  'bullets',
  'two-col',
  'image',
  'quote',
  'stat',
  'end',
] as const satisfies readonly SlideLayout[];

/**
 * Đọc một gạch đầu dòng mà không cần biết nó viết dạng nào. Ba nơi cùng dựng
 * bullet (layout `bullets`, cột của `two-col`, `image`) nên việc phân nhánh
 * chuỗi-hay-object chỉ được sống ở đúng một chỗ: ba hàm dưới đây.
 */
export function bulletItem(b: Bullet): { text: string; icon: IconName | undefined } {
  return typeof b === 'string' ? { text: b, icon: undefined } : { text: b.text, icon: b.icon };
}

export function bulletText(b: Bullet): string {
  return bulletItem(b).text;
}

export function bulletIcon(b: Bullet): IconName | undefined {
  return bulletItem(b).icon;
}
