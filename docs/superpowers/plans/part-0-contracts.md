# Part 0 — Contracts & Execution Order (AUTHORITATIVE)

> **Đọc file này TRƯỚC plan riêng của bạn.**
> Ba plan (`part-1-design-system.md`, `part-2-backend.md`, `part-3-app.md`) được viết **song song**
> bởi ba agent khác nhau nên có chỗ mâu thuẫn. **Ở bất kỳ điểm nào file này khác với plan riêng,
> FILE NÀY THẮNG.** Không tự hoà giải, không "đoán ý" — làm đúng những gì ghi ở đây.

---

## 1. Thứ tự thực thi — BẮT BUỘC

Cả ba plan đều mở đầu bằng một task scaffold (D1, B1, A1). Nếu chạy song song chúng sẽ ghi đè
`package.json` / `tsconfig.json` / `next.config.ts` của nhau.

```
PHA 0 — SCAFFOLD (một lần duy nhất, do coordinator làm trước)
        package.json · tsconfig.json · next.config.ts · eslint · tailwind/globals.css khung
        · cấu trúc thư mục · .env.example · vitest.config.ts
        ⇒ Khi pha 0 xong: D1, B1, A1 coi như ĐÃ HOÀN THÀNH. BỎ QUA chúng.

PHA 1 — SONG SONG, 3 agent, không giao nhau
        Agent DESIGN   → D2 … D20     sở hữu: src/app/globals.css, src/components/ui/**,
                                              src/components/shared/**, src/hooks/use-is-mobile.ts,
                                              src/lib/z.ts, src/lib/theme.ts, src/lib/utils.ts
        Agent BACKEND  → B2 … Bn      sở hữu: src/lib/db/**, src/lib/storage/**, src/lib/auth/**,
                                              src/lib/services/**, src/lib/text/**, src/app/api/**,
                                              drizzle/**, scripts/**
        Agent APP      → A2 … A18     sở hữu: src/app/(auth)/**, src/app/(app)/**,
                                              src/components/features/**, src/lib/search/**,
                                              src/workers/**, public/** (PWA)

PHA 2 — TÍCH HỢP + TEST (coordinator)
        A19 … A24  Playwright, screenshot đối chiếu, vòng sửa lỗi, DoD gate
```

**Quy tắc chống giẫm chân:** không agent nào được sửa file ngoài danh sách "sở hữu" của mình.
Cần một thứ từ agent khác → dùng đúng signature trong file này; nếu thiếu, báo coordinator, **không tự viết**.

---

## 2. Giải quyết xung đột P1 ↔ P3 — interface component

**Nguyên tắc: interface của P1 (`part-1-design-system.md`) là chuẩn.** P3 phải sửa cách gọi.
Lý do: P1 định nghĩa đầy đủ hơn, tự chứa, và khớp sát inline style của prototype.

### 2.1 Chốt theo P1 — P3 phải thích ứng

| Thành phần | Signature CHUẨN (P1) | P3 phải bỏ cách dùng |
|---|---|---|
| `AppShell` | `{ sidebar, children, drawerOpen, onDrawerClose, className? }` — `children` chứa `<AppHeader/>` rồi tới container trang | `{sidebar, header}` |
| `Sidebar` | `{ collapsed, drawerOpen, isMobile, onCollapse, onBrandClick?, user:{displayName,username}, onLogout, children, className? }` | `{brand, nav, sections, footer, mode, open, onClose}` |
| `SidebarNavItem` | `{ label, count?, active?, onClick, variant?:'nav'\|'priority'\|'tag', dotClassName?, hash?, className? }` — **`onClick`, KHÔNG có `href`** | `{href, prefix, dotColor}` |
| `AppHeader` | `{ showMenuButton, onMenuClick, search, settings, onNewNote, isMobile, className? }` | `{onOpenSidebar, newNoteHref}` |
| `Select<T>` | `{ options, value, onChange, ariaLabel, prefixLabel?, align?, menuMinWidth?, offset?, disabled?, className? }` | `{label, triggerPrefix}` |
| `Segmented<T>` | `{ options, value, onChange, ariaLabel, variant?:'track'\|'bordered', columns?, className? }` | `{columns, ariaLabel}` không có `variant` |
| `Pagination` | `{ page, pageCount, total, pageSize, onPageChange, className? }` — **tự sinh "Hiển thị a–b trên n"** | `{pages, rangeText}` |
| `RichTextEditor` | `forwardRef<RichTextEditorHandle>`; props `{ initialHtml, placeholder?, onChange?, onPickImage, isMobile?, className? }`; handle `{ getHtml, setHtml, focus, insertImageAtCursor, exec }` | `{editorRef, onSelectionChange}` |
| `QuizModal` | `{ open, noteTitle, review, status, questions, picks, index, isMobile, completedAtLabel?, onPick, onNext, onRetry, onClose }` — **P1 render toàn bộ 3 trạng thái**; P3 chỉ giữ state + gọi API | khung rỗng + children |
| Toast | **P1 sở hữu provider.** P3 dùng `const { flash } = useToast()` từ `@/components/ui`. Không có `ToastViewport` do P3 điều khiển | `<ToastViewport message>` |
| Mobile | `useIsMobile()` từ `@/hooks/use-is-mobile` (P1, export cả `MOBILE_BREAKPOINT = 820`) | `useMediaQuery(820)` tự viết |
| `cn()` | `import { cn } from '@/lib/utils'` — **file `src/lib/utils.ts`, KHÔNG phải thư mục** | — |

### 2.2 Chốt theo P3 — P1 phải bổ sung

**P1 CHƯA phát ra test hook.** P3 cần chúng để viết Playwright. **P1 bắt buộc thêm các attribute sau**
(dạng `data-x=""` boolean, trên phần tử gốc của component):

| Component | Attribute bắt buộc |
|---|---|
| `NoteCard` | `data-note-card` + `data-note-id={id}` |
| `NoteListRow` | `data-note-row` + `data-note-id={id}` |
| tiêu đề trong `NoteCard`/`NoteListRow` | `data-note-title` |
| `CommentList` item | `data-comment` + `data-comment-id={id}` |
| `ImageThumb` | `data-image-thumb` |
| `VersionTimeline` item | `data-version-item` + `data-version={v}` |
| `HighlightList` item | `data-highlight-item` |
| `QuizHistoryList` item | `data-quiz-history-item` |
| `QuizOption` | `data-quiz-option` + `data-state={'idle'\|'ok'\|'bad'\|'dim'}` |
| bộ đếm trong `QuizModal` | `data-quiz-counter` |
| `QuizFeedback` | `data-quiz-feedback` + `data-correct={'true'\|'false'}` |
| `Prose` | `data-prose` *(đã có)* |
| `HighlightPopup` | `data-hlpop` *(đã có)* + `data-mode={'add'\|'remove'}` |
| `Toaster` | `data-toast` |
| `EmptyState` | `data-empty-state` |
| `SearchSuggestions` | `data-search-suggestions` |

### 2.3 Quy tắc điều hướng — giải xung đột `onClick` vs `href`

P1 dùng callback, P3 muốn URL thật (cần cho deep-link + SEO + nút back).
**Chốt:** component P1 giữ nguyên `onClick`. Tầng `src/components/features/**` của P3 bọc chúng:
- `NoteCard` / `NoteListRow`: P1 nhận thêm prop **`href?: string`**; khi có `href`, phần tử gốc render
  `<Link>` (giữ nguyên toàn bộ class/style), khi không có thì render `<div onClick>`.
  Đây là ngoại lệ **duy nhất** cho quy tắc 2.1.
- `SidebarNavItem`: giữ `onClick`; P3 gọi `router.push()` bên trong callback.

---

## 3. Bổ sung bắt buộc cho P2 (backend)

Do P3 phát hiện thiếu. **P2 phải có, kể cả plan riêng không ghi:**

1. **`GET /api/search/index`** → `{ userId: string, items: SearchDoc[] }`
   `SearchDoc = { noteId, title, desc, tags: string[], contentSha, plain }`
   `plain` = nội dung đã strip HTML, cắt còn ~2000 ký tự. Dùng cho embedding trong trình duyệt.
2. **`contentSha`** phải băm trên `title \n desc \n tags.join(',') \n plain`, **không** chỉ mình body —
   nếu không, sửa tiêu đề sẽ để lại vector cũ. Loại bỏ thẻ `<mark>` khỏi đầu vào băm để việc
   đánh dấu không làm mất hiệu lực embedding.
3. **`NoteComment.author`**: `{ id, text, date, author: { id, displayName } }` — app đa người dùng,
   không hard-code "BS".
4. **`rel(iso, now?: number)`** — tham số `now` tuỳ chọn để test được mốc thời gian.
5. **`PUT /api/notes/:id/highlights`** body `{ content }` → `{ ok, contentSha }`;
   ghi vào `content` **và** content của version cuối; **KHÔNG tạo version mới**.
6. **`POST /api/notes/:id/quiz/generate`** body `{ avoid?: string[] }` →
   `{ questions, source:'ai'|'offline' }`; lỗi thiếu nội dung → `422 { code:'NOT_ENOUGH_CONTENT' }`
   (UI hiện toast "Ghi chú chưa đủ nội dung để tạo câu hỏi").
7. Script `db:seed:test` phải tôn trọng biến môi trường **`DATA_DIR`** (thư mục filesystem adapter)
   để Playwright global-setup trỏ sang thư mục riêng.

---

## 4. Quyết định sản phẩm đã chốt (không bàn lại)

| Vấn đề | Quyết định |
|---|---|
| `view` grid/list nằm ở URL hay prefs? | **URL thắng.** Chọn view ghi cả hai (URL + prefs). Đổi view **không** reset `page` (giữ đúng prototype). |
| Gõ vào ô search tạo history entry? | `q` dùng `router.replace`; các control rời rạc (sort, tag, priority, page, view) dùng `push`. |
| Sau khi khôi phục version | Redirect về `/notes/:id` sạch, bỏ `?v=`. |
| `execCommand` đã deprecated | **Giữ** để bám prototype. Bọc qua `RichTextEditorHandle.exec()`; có nhánh fallback Selection/Range cho ra kết quả HTML y hệt. |
| PWA cache | **Chỉ** precache `/offline` + static asset. Điều hướng: network-first, **không** cache. `/api/*`: **không bao giờ** cache. Lý do: mọi trang trong `(app)` là HTML đã đăng nhập — cache sẽ rò rỉ note giữa các user. |
| Dòng gợi ý `Demo · bacsi / 123456` | Chỉ hiện khi `NODE_ENV !== 'production'`. |
| `recentSearches` | Duy nhất, mới nhất trước, tối đa 5; nút "Xoá" ghi `[]`. |
| Embedding model trong CI | `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1` → không spawn worker, search keyword-only. Playwright luôn bật cờ này. |
| e5 prefix | Bắt buộc `query: ` cho truy vấn và `passage: ` cho tài liệu. |
| `Range.intersectsNode` trong jsdom | Tự cài lại bằng `compareBoundaryPoints` để test highlight chạy được. |

---

## 5. Token Tailwind — dùng đúng tên này

Quyết định nền: **`--spacing: 1px`** → mọi utility số là pixel nguyên bản (`h-46`, `px-14`, `gap-28`,
`rounded-10`, `min-w-36`). **Không paste component mặc định của shadcn/ui** (class của chúng giả định thang 4px).
Chỉ mượn *quy ước* shadcn (`components.json`, `cn()`, `cva`) và Radix cho hành vi
(`@radix-ui/react-tooltip`, `@radix-ui/react-separator`).

- Màu: `bg-bg` `bg-surface` `bg-surface2` `border-line` `border-line2` `text-text`/`bg-text`
  `text-muted` `text-faint` `bg-accent`/`text-accent`/`border-accent` `text-accent-ink` `bg-accent-soft`
  `text-hi`/`bg-hi`/`border-hi` `bg-hi-soft` `text-med`/`bg-med` `bg-med-soft` `text-low`/`bg-low`
  `bg-low-soft` `text-ok`/`bg-ok`/`border-ok` `bg-ok-soft` `bg-hl` `bg-hl2`
- Bóng: `shadow-card` (= `--shadow`), `shadow-seg` (segmented đang chọn, .12 sáng / .4 tối)
- Chữ: `font-serif` (Source Serif 4) · `font-sans` (IBM Plex Sans) · `font-mono` (IBM Plex Mono)
- Cỡ: `text-11 12 13 14 15 16 17 18 20 22 26 28 30 32 36 38 44 52 64` + `text-fs` (nội dung prose)
- Bo góc: `rounded-2 3 4 5 6 7 8 9 10 11 12 14` · `rounded-full` (999px) · `rounded-circle` (50%)
- Theme: `data-theme="dark"` trên `<html>` (có `@custom-variant dark` nên `dark:` vẫn dùng được).
  Accent: `data-accent="teal|indigo|plum"`. Cỡ chữ prose: `--fs` (14–22).
- Breakpoint: `max-[819px]:` / `min-[820px]:`. Z-index: hằng `Z` từ `@/lib/z`.

Barrel import: `from '@/components/ui'` và `from '@/components/shared'`.
Deep import chỉ được phép **bên trong** `src/components/`; cấm từ `src/app/` (có test chặn ở D20).

---

## 6. Nhắc lại quy tắc bất di bất dịch

1. **Shared component** — xem `CLAUDE.md`. Không copy markup. Không `<select>` thuần. Không component trùng.
2. **Bám 100% design spec** — mọi con số khớp `docs/reference/So Lam Sang.dc.html`.
3. **Không emoji.** Icon = `<Icon name="…" />`.
4. **Tên app `Kno-Notes`**, logo chữ **`K`**, đa người dùng, mọi truy cập scope theo `userId`.
5. **Chi phí 0đ.** Không thêm dịch vụ trả phí.
6. **TDD**, `npm run check` sạch trước mỗi commit, conventional commits.

---

## 7. Pha 0 ĐÃ HOÀN THÀNH — trạng thái bàn giao

Coordinator đã scaffold xong. **D1, B1, A1 coi như đã xong — BỎ QUA chúng**, chỉ đọc để biết ý định.

Đã có sẵn trong repo (đã `npm install`, `tsc`/`eslint`/`next build` đều xanh):

| File | Ghi chú |
|---|---|
| `package.json` | Toàn bộ dependency + script. **Chỉ thêm dep khi thật sự cần**, không đổi version đã ghim. |
| `tsconfig.json` | strict, alias `@/*` → `./src/*`, types `vitest/globals` + `@testing-library/jest-dom` |
| `next.config.ts` | alias `onnxruntime-node:false` cho bundle client, header cho `/sw.js` |
| `eslint.config.mjs` | `next/core-web-vitals` + `next/typescript`, cấm `any` |
| `postcss.config.mjs` | `@tailwindcss/postcss` |
| `vitest.config.ts` | jsdom, globals, alias `@`, include `src/**/*.{test,spec}.{ts,tsx}` |
| `vitest.setup.ts` | jest-dom + **polyfill `Range.prototype.intersectsNode`** + `matchMedia` |
| `drizzle.config.ts` | schema `./src/lib/db/schema.ts`, out `./drizzle` |
| `scripts/db-setup.sh` | tạo `kno_notes_dev` + `kno_notes_test` (đã chạy, DB đã tồn tại) |
| `.env.example` / `.env.local` / `.env.test` | `.env.local` đã có `AUTH_SECRET` thật |
| `src/lib/utils.ts` | `cn()` — đã có, D4 được phép mở rộng |

**File PLACEHOLDER — phải thay, đừng xây lên trên:**
- `src/app/globals.css` → D2/D3 thay (hiện chỉ có `@import "tailwindcss";`)
- `src/app/layout.tsx` → A4 thay
- `src/app/page.tsx` → A7 thay

Phiên bản đã ghim khác với plan riêng:
- `next@^15.5.26` (không phải 15.5.4) — vẫn là Next 15, **không** nâng lên 16.
- `drizzle-orm@^0.45.3`, `tailwindcss@^4.3.3`, `@huggingface/transformers@^4.3.0`.
- **`@modelcontextprotocol/sdk` ghim CỨNG `1.26.0`** vì `mcp-handler@1.1.0` yêu cầu đúng bản đó. Không nâng.
- Radix chỉ có `slot`, `tooltip`, `separator` (Popover/Select/Segmented/Slider/Toast tự viết theo D9/D10).

## 8. Sửa dữ liệu seed — quiz mẫu của prototype bị sai

Prototype seed `picks: [0,2,1,3]` với `answer` lần lượt `0,2,1,3` → cả 4 câu đúng, nhưng ghi `score: 3`.
Port nguyên văn sẽ khiến trang chi tiết hiện "3/4 · 75%" trong khi phần "Xem lại đáp án" đánh dấu ✓ cả 4 câu
— người dùng nhìn thấy ngay là sai.

**Chốt:** seed phải **tự tính `score` từ `picks` vs `answer`**, không hard-code. Với bộ câu hỏi mẫu,
đổi `picks` thành `[0, 2, 1, 0]` (câu cuối sai) để `score = 3` khớp đúng ý đồ hiển thị của prototype.
Thêm một test khẳng định: với mọi bản ghi quiz, `score === số phần tử picks[i] === questions[i].answer`.
