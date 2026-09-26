// src/lib/types.ts
// Domain types — tên trường giữ NGUYÊN của prototype (`n.desc`, `n.fav`, `v.v`,
// `q.explain`) để logic port sang đọc y hệt.

/** Ưu tiên của ghi chú. Thứ tự sắp xếp: high → medium → low. */
export type Priority = 'high' | 'medium' | 'low';

/** Khoá sắp xếp trên dashboard. */
export type SortKey = 'updated' | 'priority' | 'title';

/** Mục điều hướng sidebar. */
export type NavKey = 'all' | 'fav';

/** Ảnh trong thư viện của ghi chú. `src` là URL proxy, không phải data URL. */
export interface NoteImage {
  id: string;
  label: string;
  /** `/api/images/{userId}/{imageId}` */
  src: string;
}

/** Tác giả bình luận. App đa người dùng — không bao giờ hard-code "BS". */
export interface CommentAuthor {
  id: string;
  displayName: string;
}

export interface NoteComment {
  id: string;
  text: string;
  /** ISO-8601 */
  date: string;
  /**
   * Vắng mặt trên dữ liệu seed cũ; UI hiển thị 2 ký tự đầu của
   * `comment.author.displayName`, hoặc "?" khi thiếu.
   */
  author?: CommentAuthor;
}

export interface NoteVersion {
  v: number;
  /** ISO-8601 */
  date: string;
  /** Ghi chú thay đổi, vd "Cập nhật nội dung", "Khôi phục từ v2". */
  note: string;
  title: string;
  /** HTML đầy đủ tại phiên bản này. */
  content: string;
}

export interface Question {
  q: string;
  /** Luôn đúng 4 phần tử. */
  options: string[];
  /** Chỉ số đáp án đúng trong `options`, 0..3. */
  answer: number;
  explain: string;
}

export interface Quiz {
  id: string;
  /** ISO-8601 */
  date: string;
  score: number;
  total: number;
  source: 'ai' | 'offline';
  /** Lựa chọn của người dùng theo từng câu; `null` nếu bỏ qua. */
  picks: (number | null)[];
  questions: Question[];
}

/** Bản ghi đầy đủ lưu tại `data/users/<userId>/notes/<noteId>.json`. */
export interface Note {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  fav: boolean;
  /** ISO-8601 */
  created: string;
  /** ISO-8601 */
  updated: string;
  /** HTML của phiên bản hiện tại. */
  content: string;
  images: NoteImage[];
  comments: NoteComment[];
  /** Tăng dần theo `v`; phần tử cuối là phiên bản hiện tại. */
  versions: NoteVersion[];
  /** Mới nhất ở đầu mảng. */
  quizzes: Quiz[];
}

/**
 * Bản rút gọn cho dashboard — dựng hoàn toàn từ `note_index`,
 * KHÔNG chạm vào storage adapter.
 */
export interface NoteSummary {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  fav: boolean;
  /** ISO-8601 */
  created: string;
  /** ISO-8601 */
  updated: string;
  latestVersion: number;
  imageCount: number;
  commentCount: number;
  quizCount: number;
}

/** Một hàng của bảng `note_index` trong Postgres. */
export interface NoteIndexRow {
  id: string;
  userId: string;
  noteId: string;
  title: string;
  /** `norm(title)` — dùng cho tìm kiếm không dấu. */
  titleNorm: string;
  description: string;
  /** `norm(description)` */
  descriptionNorm: string;
  priority: Priority;
  favorite: boolean;
  /** `slugify()` của từng tag, đã khử dấu. */
  tagSlugs: string[];
  /** Tên tag hiển thị, cùng thứ tự với `tagSlugs`. */
  tagNames: string[];
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 */
  updatedAt: string;
  latestVersion: number;
  imageCount: number;
  commentCount: number;
  quizCount: number;
  /** Băm ngữ nghĩa của nội dung; null khi chưa ghi lần nào. */
  contentSha: string | null;
}

/**
 * Một hàng của `GET /api/search/index` — đủ để xếp hạng, nhúng vector và vẽ
 * đúng dòng gợi ý của prototype (chấm ưu tiên + `#thẻ · rel(updated)`).
 * Bản sao cấu trúc y hệt nằm ở `src/lib/search/types.ts` (search core đứng
 * độc lập, không import domain type).
 */
export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  /** ISO-8601 — dòng phụ của gợi ý và thứ tự "Mở gần đây". */
  updated: string;
  /** sha của `title \n desc \n tags.join(',') \n plain`, đã bỏ `<mark>`. */
  contentSha: string;
  /** Nội dung đã strip HTML, server cắt còn ~2000 ký tự. */
  plain: string;
  /** Văn bản các đoạn đã đánh dấu, server đã chặn số lượng và độ dài. */
  highlights: string[];
  /** Alt của ảnh: nhãn ảnh đính kèm + alt của ảnh lồng trong bài. */
  imageAlts: string[];
}

export interface UserPrefs {
  userId: string;
  theme: 'light' | 'dark';
  /** 14..22 */
  fontSize: number;
  view: 'grid' | 'list';
  sidebarCollapsed: boolean;
  /** Tối đa 5 mục, mới nhất ở đầu. */
  recentSearches: string[];
}

/** Khoá API không bao giờ trả về giá trị đầy đủ sau lần tạo đầu tiên. */
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  /** 10 ký tự đầu, vd `kn_1a2b3c4`. */
  prefix: string;
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 hoặc null nếu chưa dùng. */
  lastUsedAt: string | null;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export interface NoteFilters {
  /** Chuỗi thô người dùng gõ; `#` đầu chuỗi = chỉ tìm trong tag. */
  query?: string;
  nav?: NavKey;
  priority?: Priority | null;
  /** Tên tag hiển thị (không phải slug). */
  tag?: string | null;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface NoteListResult {
  notes: NoteSummary[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

export interface CreateNoteInput {
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  content: string;
  images: NoteImage[];
  /** Rỗng => "Tạo ghi chú". */
  changeNote?: string;
}

export interface UpdateNoteInput {
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  content: string;
  images: NoteImage[];
  /** Rỗng => "Cập nhật nội dung". */
  changeNote?: string;
}

/** Vỏ lỗi JSON dùng chung cho cả API nội bộ và `/api/v1`. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'] as const;

/** Trọng số sắp xếp — khớp `PRI_ORDER` trong prototype. */
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Nhãn tiếng Việt — khớp `PRI` trong prototype. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

export const DEFAULT_PAGE_SIZE = 6;
