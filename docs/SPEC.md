# Kno-Notes — Đặc tả dự án (nguồn chuẩn)

> Đây là spec chuẩn cho toàn bộ dự án. Mọi plan và task phải truy về tài liệu này.
> Tài liệu thiết kế gốc (bắt buộc bám 100%):
> - `docs/reference/Design Spec.dc.html` — token, kiểu chữ, khoảng cách, component, microcopy, data model
> - `docs/reference/So Lam Sang.dc.html` — prototype tương tác đầy đủ (nguồn chuẩn cho UI + hành vi + style inline chính xác)
>
> Hai file trên dùng runtime "DC" (`{{ }}` + `<sc-if>` / `<sc-for>`). Cách đọc: template = markup + **inline style chính xác từng pixel**; `renderVals()` trong `<script data-dc-script>` = toàn bộ logic + dữ liệu binding. Khi port sang React/Tailwind, mọi giá trị số (height, padding, radius, font-size, gap, color token) phải **giữ nguyên tuyệt đối**.

---

## 0. Đổi tên & thương hiệu

Prototype tên "Sổ Lâm Sàng" (app cho 1 bác sĩ). Sản phẩm thật:

- **Tên app: `Kno-Notes`** — thay mọi chỗ hiển thị "Sổ Lâm Sàng" → "Kno-Notes".
- Logo chữ trong ô accent: **`K`** (thay `S`).
- Dự án Vercel: `kno-notes`; domain: `kno-notes.vercel.app`.
- Mô tả login: "Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục." (bỏ chữ "lâm sàng" vì app dùng cho nhiều người/nhiều lĩnh vực).
- **Ngôn ngữ giao diện: tiếng Việt** — giữ nguyên toàn bộ microcopy trong Design Spec mục 09, trừ các chuỗi chứa tên app.
- App **đa người dùng** (nhiều người dùng chung 1 deployment), không phải 1 user. Không có đăng ký công khai (admin seed user).
- Avatar sidebar: 2 ký tự đầu của `displayName` (thay "BS" cứng). Tên hiển thị + username lấy từ session.

---

## 1. Yêu cầu chức năng (đầy đủ)

### 1.1 Gốc
1. Ghi note kiến thức.
2. Trang: **Dashboard**, **Detail**, **Edit**.
3. Editor **WYSIWYG**.
4. **Tag** + **version**.
5. **Search** theo title, description, tag.
6. **Responsive** desktop + mobile (1 breakpoint: 820px).
7. **Upload + xem hình ảnh**.
8. **Pagination**.
9. **Favorite**.
10. **Comment**.
11. Login username/password, **không signup**.
12. **Light/dark mode** + **font-size 14–22px**.
13. **Priority** (high/medium/low).
14. Thiết kế hiện đại, đơn giản, gọn, tập trung nội dung, viewport rộng rãi.

### 1.2 Vòng 2
15. Dashboard **2 chế độ: grid + list**, nhớ lựa chọn.
16. **Select box phải là custom component** — cấm `<select>` thuần ở mọi nơi.
17. Ô search focus/click → **hiện suggestion panel**.
18. **Sidebar đóng/mở được** cả desktop (nhớ trạng thái) và mobile (drawer).

### 1.3 Vòng 3
19. **Quiz trắc nghiệm**: nút Trắc nghiệm ở detail → **modal full screen**, câu hỏi sinh từ nội dung note.
20. **Lưu lịch sử quiz**, hiển thị ở rail detail, click mở màn review.
21. **Highlight**: bôi đen → popup "Đánh dấu"; click đoạn đã đánh dấu → "Bỏ đánh dấu".

### 1.4 Yêu cầu vận hành (vòng 4 — quyết định kiến trúc)
22. **Next.js** (App Router) + **Tailwind CSS** + **shadcn/ui**. Design spec phải setup bằng Tailwind theme tokens + shadcn.
23. **DB của Vercel** (Postgres/Neon free) lưu: user, tag, chỉ mục note (metadata), phiên, api key.
24. **Note + quiz lưu ở private GitHub repo** qua PAT (env var trên Vercel). Dữ liệu **nhóm theo user** để search giới hạn phạm vi.
25. **PWA** (manifest + service worker, installable, offline shell).
26. **MCP server** để Claude/Codex soạn note + quiz; nếu không khả thi thì **bắt buộc có REST API CRUD note cho AI**. → Làm **cả hai**.
27. **Vector search ở local (trình duyệt)** cho search theo ngữ nghĩa, kết hợp keyword. Không tốn chi phí server.
28. **Toàn bộ chi phí = 0đ** (free tier). Mọi giải pháp phải thoả tiêu chí này.
29. **Shared component rule** (xem §5) — cực kỳ quan trọng, ghi vào CLAUDE.md.
30. Git commit local trước (repo URL cấp sau).
31. Tự test bằng **Playwright**, tự chụp ảnh màn hình và tự đánh giá cho tới khi đạt.

---

## 2. Kiến trúc đã chốt (tự suy luận — không hỏi thêm)

### 2.1 Stack
| Lớp | Lựa chọn | Lý do free |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript (strict) | Vercel Hobby free |
| CSS | Tailwind CSS v4 (`@theme`) | free |
| UI kit | shadcn/ui (copy-in, Radix primitives) | free |
| DB | Vercel Postgres (Neon integration) + Drizzle ORM | Neon free tier |
| Note/Quiz store | private GitHub repo qua Octokit Contents API | GitHub free |
| Ảnh | file trong GitHub repo + route proxy `/api/images/[...]` cache immutable | free |
| Auth | tự làm: bcryptjs hash + JWT (jose) trong httpOnly cookie | free, không cần dịch vụ |
| LLM quiz | Google Gemini free tier (`@google/generative-ai`) + fallback offline | free tier |
| Vector search | `@huggingface/transformers` (transformers.js) chạy trong Web Worker, model `Xenova/multilingual-e5-small` quantized, cache IndexedDB | 100% client, 0đ |
| PWA | manifest + service worker tự viết (không cần next-pwa) | free |
| MCP | route `/api/mcp` (Streamable HTTP) qua `mcp-handler` + `@modelcontextprotocol/sdk` | free |
| Test | Playwright | free |

### 2.2 Phân chia lưu trữ
**Postgres (Vercel/Neon)** — dữ liệu nhỏ, cần query/khoá:
```
users(id, username UNIQUE, password_hash, display_name, created_at)
api_keys(id, user_id, name, token_hash, prefix, created_at, last_used_at)
tags(id, user_id, name, slug, created_at)  -- UNIQUE(user_id, slug)
note_index(                                -- chỉ mục để list/filter/paginate nhanh
  id, user_id, note_id UNIQUE per user, title, description,
  priority, favorite, tag_slugs text[], created_at, updated_at,
  latest_version int, image_count int, comment_count int, quiz_count int,
  content_sha  -- sha blob GitHub để invalidate cache/embedding
)
user_prefs(user_id PK, theme, font_size, view, sidebar_collapsed, recent_searches jsonb)
```

**GitHub private repo** — nội dung nặng, nhóm theo user:
```
data/users/<userId>/notes/<noteId>.json      // Note đầy đủ: content, versions[], comments[], images[] (metadata), quizzes[]
data/users/<userId>/images/<imageId>.<ext>   // binary ảnh
data/users/<userId>/index.json               // (tuỳ chọn) snapshot để rebuild Postgres
```
- Ghi qua Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`), giữ `sha` để update.
- Mọi ghi là 1 commit; message: `feat(note): <action> <noteId> by <username>`.
- Env: `GITHUB_TOKEN` (PAT), `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` (mặc định `main`).
- **Bắt buộc**: đường dẫn luôn chứa `users/<userId>/` → không bao giờ đọc chéo user. Layer storage nhận `userId` là tham số đầu tiên, không optional.

### 2.3 Vector search local
- Khi đăng nhập/dashboard mount: tải danh sách `{noteId, title, desc, tags, contentSha}` của user hiện tại.
- Web Worker khởi tạo pipeline embedding (lazy, sau `requestIdleCallback`), sinh embedding cho `title + desc + tags + plaintext(content 512 token đầu)`.
- Lưu embedding vào IndexedDB: key `userId:noteId`, value `{sha, vector Float32Array}`. Chỉ tính lại khi `sha` đổi.
- Search = **hybrid**: `score = 0.6 * keyword + 0.4 * cosine`, keyword dùng thuật toán chuẩn hoá tiếng Việt hiện có (NFD, bỏ dấu, `đ→d`).
- Keyword soi cả **đoạn đã đánh dấu** (`<mark data-hl>`), nấc 0.55 — trên mô tả (0.45), dưới thẻ (0.6): đoạn bôi là thứ người đọc tự chọn nên đáng hơn mô tả, nhưng vẫn là mảnh văn xuôi chứ không phải nhãn. Hàng gợi ý hiện đúng đoạn đã khớp trên nền `--hl` để kết quả không vô cớ.
- Keyword soi cả **alt của ảnh** (nhãn ảnh đính kèm + `<img alt>` trong bài), nấc 0.50 — dưới đoạn đánh dấu, trên mô tả. Ảnh không có alt thì không đóng góp gì.
- Trong lúc model chưa sẵn sàng → dùng keyword-only (không chặn UI). Prefix `#` vẫn chỉ tìm trong tag (không dùng vector).
- Model cache qua Cache API; kích thước tải một lần, sau đó offline.

### 2.4 API cho AI + MCP
- **REST** `/api/v1/*`, auth bằng `Authorization: Bearer <apiKey>`:
  - `GET /api/v1/notes` (query: q, tag, priority, favorite, page, pageSize)
  - `POST /api/v1/notes`, `GET|PATCH|DELETE /api/v1/notes/{id}`
  - `GET /api/v1/tags`
  - `POST /api/v1/notes/{id}/quizzes`, `GET /api/v1/notes/{id}/quizzes`
  - `GET|PUT /api/v1/notes/{id}/questions` — bộ câu hỏi soạn sẵn
  - `POST /api/v1/notes/{id}/comments`
- **MCP** `/api/mcp` (Streamable HTTP), cùng auth bearer, tools:
  `list_notes, search_notes, get_note, create_note, update_note, delete_note, list_tags, set_quiz_questions, get_quiz_questions, create_quiz, list_quizzes`.
  `create_note`/`update_note` nhận luôn `questions`; `set_quiz_questions` thay toàn bộ bộ câu hỏi của ghi chú đã có mà không đụng nội dung.
- API key sinh ở trang `/settings/api-keys`, hiển thị 1 lần, lưu hash (sha256).

### 2.5 Quiz
- **Nguồn chính là bộ câu hỏi soạn sẵn của ghi chú** (`note.questions`), do người dùng hoặc một tác nhân AI soạn qua MCP / `PUT /api/v1/notes/{id}/questions`. Mỗi lần làm bài: xáo thứ tự câu, lấy tối đa 5, và **luôn đảo vị trí 4 lựa chọn** (`answer` đi theo đáp án đúng, đảo theo chỉ số để không sai khi hai lựa chọn trùng chữ). Nội dung câu hỏi không đổi — đó là điểm của việc soạn trước.
- Thứ tự chọn nguồn trong `POST /api/notes/{id}/quiz/generate`: **Gemini** (chỉ khi có `GOOGLE_GENERATIVE_AI_API_KEY`) → **bộ soạn sẵn** → **bộ sinh tự động**. Có key nghĩa là người dùng chủ động muốn dùng AI; AI lỗi/hết quota thì rơi về bộ soạn sẵn, cuối cùng mới tới `offlineQuiz()`.
- Prompt Gemini giữ nguyên như prototype (5 câu, 4 đáp án, JSON, tránh lặp 10 câu gần nhất).
- `Quiz.source` = `'ai' | 'bank' | 'offline'`, **hiện trên màn hình kết quả**. Trước đây nguồn là vô hình nên AI hỏng mà không ai biết.
- Sửa bộ câu hỏi **không tạo phiên bản mới** (cùng lý do như đánh dấu đoạn). `PATCH` ghi chú mà bỏ trống `questions` = giữ nguyên bộ cũ; gửi `[]` mới là xoá.
- Kết quả lưu vào `note.quizzes` (mới nhất đầu) trong GitHub JSON + tăng `quiz_count` ở note_index.

---

## 3. Hành vi bắt buộc (port 1:1 từ prototype)

Mọi hàm/logic dưới đây phải giữ đúng ngữ nghĩa:

| Hành vi | Nguồn trong prototype |
|---|---|
| `norm()` chuẩn hoá tiếng Việt | `s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')` |
| `rel()` thời gian tương đối | < 1' "vừa xong"; < 60' "x phút trước"; < 24h "x giờ trước"; < 7d "x ngày trước"; còn lại `dd/mm/yyyy` |
| `fmt()` ngày | `dd/mm/yyyy` |
| Sort | `updated` desc · `priority` (high→low rồi updated desc) · `title` `localeCompare(…, 'vi')` |
| Lọc | nav(all/fav) + priority + tag + query; query thường soi cả đoạn đã đánh dấu và alt ảnh; `#` prefix → chỉ tag |
| Ảnh | một ảnh = một mục trong `note.images`, hiện ở HAI chỗ: lồng trong bài (`<img>` trong `content`) và thư viện cuối bài. Nút Ảnh chèn tại con trỏ, kéo thả chèn cuối bài; sửa alt hoặc gỡ ảnh đồng bộ cả hai chỗ. Bấm ảnh trong bài mở lightbox của cả bộ, đúng vị trí ảnh đó |
| Phân trang | pageSize 6 mặc định; đổi filter → page 1; đổi trang → scroll top |
| Version | v1 khi tạo; +1 khi `html !== content || title !== n.title`; note mặc định "Cập nhật nội dung" / "Tạo ghi chú"; restore tạo version mới "Khôi phục từ vN" |
| Highlight | `wrapRange()` + `unwrapHl()` nguyên văn; commit vào `content` **và** version cuối; **không** tạo version mới; văn bản đoạn bôi được dẫn xuất vào `note_index.highlights` + `SearchDoc.highlights` để tìm kiếm |
| Quiz state machine | loading → asking → done; chọn 1 lần/câu; phím 1–4, Enter; token huỷ khi đóng modal |
| Điểm quiz | ≥80% "Nắm vững" (--ok) · ≥50% "Cần ôn thêm" (--med) · <50% "Nên đọc lại ghi chú" (--hi) |
| Suggestion | chưa gõ: recent(5) + tags(8) + "Mở gần đây"(4); đang gõ: "Thẻ khớp"(6) + "Ghi chú khớp"(6) + "Xem tất cả kết quả cho …" |
| Esc | đóng lightbox, settings, drawer, suggestion, sort, quiz |
| Toast | 2200ms tự ẩn |
| Tag input | Enter hoặc `,` thêm; Backspace khi rỗng xoá cuối; so trùng không dấu |

**Khác biệt có chủ ý so với prototype** (do lên server thật):
- `localStorage` → Postgres (`user_prefs`) + GitHub (notes). Vẫn cache client để first paint nhanh.
- Ảnh data-URL → upload lên GitHub, trả về URL `/api/images/{userId}/{imageId}` (ảnh inline trong content dùng URL này, không nhúng base64).
- `window.claude.complete` → `POST /api/notes/{id}/quiz/generate`.
- Điều hướng bằng state → **URL thật**: `/login`, `/`, `/notes/[id]`, `/notes/[id]/edit`, `/notes/new`. Filter/sort/page/query nằm trên query string để share link được.

---

## 4. Routes

```
/login                     Đăng nhập
/                          Dashboard (?q=&tag=&priority=&fav=&sort=&page=&view=)
/notes/new                 Editor tạo mới
/notes/[id]                Chi tiết (?v=<version> để xem bản cũ)
/notes/[id]/edit           Editor sửa
/settings/api-keys         Quản lý API key cho AI
/manifest.webmanifest, /sw.js, /offline
/api/auth/login|logout|me
/api/notes ...             API nội bộ (cookie session)
/api/images/[userId]/[imageId]
/api/v1/...                API công khai cho AI (bearer)
/api/mcp                   MCP Streamable HTTP
```

---

## 5. ⚠️ QUY TẮC SHARED COMPONENT — CỰC KỲ QUAN TRỌNG

**Cấm tuyệt đối viết trùng lặp một dạng component.** Mọi thành phần UI dùng ở ≥ 2 nơi (hoặc có khả năng dùng lại) **phải** nằm trong `src/components/ui/` (primitive) hoặc `src/components/shared/` (composite nghiệp vụ), rồi page/feature mới import dùng.

- Trước khi viết bất kỳ JSX nào: **tìm trong `src/components/` xem đã có chưa**. Có → dùng/mở rộng bằng prop hoặc variant. Không → tạo shared component rồi mới dùng.
- Cấm copy-paste markup giữa các page.
- Cấm hard-code giá trị màu/size trong page khi đã có token/variant.
- Mọi variant thể hiện qua `cva` variants, không phải component mới.
- Rule này phải được ghi vào `CLAUDE.md` ở thư mục gốc với dấu nhấn mạnh.

Danh mục shared component tối thiểu (tên chốt, dùng chính xác):

**`src/components/ui/`** (primitive, shadcn-style):
`Button`, `IconButton`, `Input`, `Textarea`, `Label`, `Badge`, `Chip`, `Pill`, `Popover`, `Select` (custom, không dùng `<select>`), `Segmented`, `Toggle`, `Toast`/`Toaster`, `Skeleton`, `Separator`, `Kbd`, `Spinner`, `Slider`, `Avatar`, `Tooltip`, `ScrollArea`, `Icon` (bộ SVG 24×24 của spec).

**`src/components/shared/`** (composite nghiệp vụ):
`AppShell`, `Sidebar`, `SidebarNavItem`, `SidebarSection`, `AppHeader`, `SearchBox`, `SearchSuggestions`, `SettingsPopover`, `ThemeSwitch`, `FontSizeControl`, `NoteCard`, `NoteListRow`, `NoteGrid`, `NoteList`, `PriorityDot`, `PriorityPill`, `PriorityLabel`, `PrioritySegmented`, `TagChip`, `TagInput`, `TagSuggestions`, `FilterChips`, `SortSelect`, `ViewToggle`, `Pagination`, `EmptyState`, `Prose`, `RichTextEditor`, `EditorToolbar`, `ImageDropzone`, `ImageGrid`, `ImageThumb`, `Lightbox`, `CommentList`, `CommentComposer`, `VersionTimeline`, `VersionBanner`, `DeleteConfirmBanner`, `QuizModal`, `QuizOption`, `QuizFeedback`, `QuizResult`, `QuizHistoryList`, `HighlightPopup`, `HighlightList`, `InfoGrid`, `SectionLabel`, `Rail`.

---

## 6. Tiêu chí hoàn thành (Definition of Done)

1. `npm run build` + `tsc --noEmit` + `eslint` sạch.
2. Unit test (Vitest) cho: `norm`, `rel`, `fmt`, sort, filter, pagination, version logic, highlight wrap/unwrap, offlineQuiz, hybrid search scoring, storage path scoping theo user.
3. Playwright e2e phủ: login sai/đúng, dashboard filter/sort/grid-list/pagination, tạo note → save v1, sửa note → v2, xem bản cũ + khôi phục, favorite, comment thêm/xoá, tag CRUD trong editor, upload ảnh + lightbox, highlight thêm/xoá, quiz full flow + lưu lịch sử + review, search suggestion + `#tag` + Enter, theme + font-size, sidebar collapse desktop + drawer mobile, PWA manifest, API v1 CRUD với bearer, MCP tools list.
4. Screenshot desktop (1440×900) + mobile (390×844), **light và dark**, cho cả 5 màn hình; tự đối chiếu với `Design Spec.dc.html` và sửa tới khi khớp.
5. Không còn component trùng lặp (§5).
6. Git repo local, commit theo từng task, message conventional.

---

## 7. Biến môi trường

```
DATABASE_URL=                  # Neon/Vercel Postgres
AUTH_SECRET=                   # JWT ký session (openssl rand -base64 32)
GITHUB_TOKEN=                  # PAT private repo (repo scope)
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_BRANCH=main
GOOGLE_GENERATIVE_AI_API_KEY=  # tuỳ chọn; thiếu thì quiz dùng fallback offline
NEXT_PUBLIC_APP_NAME=Kno-Notes
```
