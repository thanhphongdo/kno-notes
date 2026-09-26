# Kno-Notes — Hướng dẫn bắt buộc cho mọi agent làm việc trong repo này

App ghi chú kiến thức cá nhân, giao diện **tiếng Việt**, deploy Vercel (`kno-notes.vercel.app`).
Spec chuẩn: `docs/SPEC.md`. Thiết kế gốc: `docs/reference/Design Spec.dc.html` + `docs/reference/So Lam Sang.dc.html`.

---

# 🔴🔴🔴 QUY TẮC SỐ 1 — SHARED COMPONENT — VI PHẠM = REJECT 🔴🔴🔴

## **TUYỆT ĐỐI KHÔNG VIẾT TRÙNG LẶP COMPONENT.**

> Nếu một dạng UI xuất hiện ở **≥ 2 nơi**, hoặc **có khả năng dùng lại**, nó **PHẢI** là một shared component
> trong `src/components/ui/` (primitive) hoặc `src/components/shared/` (composite nghiệp vụ).
> Page và feature **chỉ được import và dùng**, **KHÔNG được tự viết lại markup**.

### Quy trình BẮT BUỘC trước khi viết bất kỳ dòng JSX nào

1. **TÌM TRƯỚC.** Chạy `ls src/components/ui src/components/shared` và `rg "export function <Tên>" src/components`.
2. **ĐÃ CÓ** → import và dùng. Thiếu tính năng? → **mở rộng bằng `prop` hoặc `cva` variant**, không tạo component mới.
3. **CHƯA CÓ** → tạo shared component trước, viết test cho nó, **rồi mới** dùng trong page.
4. Không bao giờ để logic/markup của component sống trong file page.

### Cấm tuyệt đối

| ❌ Cấm | ✅ Thay bằng |
|---|---|
| Copy-paste markup giữa 2 page | Tách thành shared component |
| `<button className="h-9 px-3 rounded-[9px] border …">` trong page | `<Button variant="secondary" size="sm">` |
| `<div>` badge/chip/pill tự chế trong page | `<Chip>` / `<Pill>` / `<TagChip>` |
| Tạo `NoteCardSmall`, `NoteCard2`, `NoteCardV2` | Thêm variant vào `NoteCard` |
| `<select>` HTML thuần | `<Select>` custom (yêu cầu khách hàng #16) |
| Hard-code mã màu `#17756b`, `#b3382e`… | Token Tailwind: `bg-accent`, `text-hi`, `border-line` |
| Hard-code `17px`, `#63676c` khi đã có token | `text-body`, `text-muted` |
| Viết lại icon SVG inline trong page | `<Icon name="search" />` |
| Tự viết toast/modal/popover riêng | `useToast()`, `<Popover>`, `<QuizModal>` |

### Khi review / trước khi commit — tự kiểm

- [ ] Có đoạn markup nào trong page trùng > 3 dòng với nơi khác không? → tách shared.
- [ ] Có class Tailwind nào lặp lại ở ≥ 2 file không? → thành variant.
- [ ] Có giá trị màu/kích thước hard-code không? → dùng token.
- [ ] Có `<select>`, `<dialog>`, `alert()`, `confirm()` thuần không? → thay bằng component chung.

**Danh mục shared component chốt: xem `docs/SPEC.md` §5. Dùng đúng tên đó, không đặt tên khác.**

---

# Quy tắc số 2 — Bám 100% design spec

- Mọi giá trị số (height, padding, gap, radius, font-size, line-height, letter-spacing, stroke-width) phải **khớp tuyệt đối** với prototype `docs/reference/So Lam Sang.dc.html` (inline style) và `Design Spec.dc.html`.
- Không "làm đẹp thêm", không đổi màu, không đổi spacing theo ý mình.
- Màu **chỉ** lấy từ token CSS custom property; light + dark đều phải đúng.
- **Không dùng emoji** ở bất kỳ đâu trong UI. Icon = inline SVG 24×24, `fill:none`, `stroke:currentColor`, `stroke-linecap/linejoin: round`.
- Font: **Source Serif 4** (tiêu đề + nội dung đọc), **IBM Plex Sans** (UI), **IBM Plex Mono** (số, version, phím tắt).
- Breakpoint duy nhất: **820px**.
- Microcopy tiếng Việt lấy nguyên văn từ Design Spec §09.

# Quy tắc số 3 — Tên app

- Tên hiển thị: **Kno-Notes** (không còn "Sổ Lâm Sàng"). Chữ trong logo: **K**.
- App **đa người dùng**. Mọi truy cập dữ liệu **phải scope theo `userId`** ở tầng storage.

# Quy tắc số 4 — Chi phí = 0đ

Chỉ dùng free tier: Vercel Hobby, Neon/Vercel Postgres free, GitHub private repo (qua PAT) cho note + ảnh, Gemini free tier cho quiz (có fallback offline khi thiếu key), vector search chạy **trong trình duyệt** (transformers.js + IndexedDB).
**Cấm** thêm dịch vụ trả phí: Redis, S3, Vercel Blob/KV trả phí, Algolia, Pinecone, Auth0/Clerk…

# Quy tắc số 5 — Chất lượng

- TypeScript `strict`, không `any` trừ khi có comment giải thích.
- TDD: viết test đỏ → code → test xanh → commit.
- `npm run check` (tsc + eslint + vitest) phải sạch trước mỗi commit.
- Commit nhỏ, conventional commits tiếng Anh (`feat:`, `fix:`, `test:`, `chore:`).
- Không commit secret. `.env.local` nằm trong `.gitignore`.

# Cấu trúc thư mục

```
src/
  app/                 # Next.js App Router (pages + route handlers)
  components/ui/       # Primitive dùng chung (shadcn-style) ← BẮT BUỘC tái sử dụng
  components/shared/   # Composite nghiệp vụ dùng chung   ← BẮT BUỘC tái sử dụng
  lib/types.ts         # Domain types
  lib/utils/           # Hàm thuần (norm, rel, fmt, sections…)
  lib/db/              # Drizzle schema + client
  lib/storage/         # GitHub Contents API (scope theo userId)
  lib/auth/            # bcrypt + jose session
  lib/services/        # notes, quiz, search
  workers/             # Web Worker embedding
docs/                  # SPEC + reference + plans
e2e/                   # Playwright
```

# Lệnh

```bash
npm run dev        # dev server
npm run check      # tsc --noEmit && eslint && vitest run
npm run test:e2e   # Playwright
npm run build      # production build
```
