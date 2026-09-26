# Visual review — Kno-Notes vs `Design Spec.dc.html`

Screenshots compared screen by screen against `docs/reference/Design Spec.dc.html`
and, where the spec defers to the prototype, against `docs/reference/So Lam Sang.dc.html`.

SPEC §6.4 asks for the five screens in two themes and two viewports. This review
covers **ten** screens — the five plus the four overlays and the second dashboard
mode — because the overlays carry most of the colour tokens and all of the
microcopy in §09.

---

## How these screenshots were produced

    E2E_SLOT=visual E2E_PORT=3102 npx playwright test e2e/visual.spec.ts

Harness: `e2e/visual.spec.ts` and `e2e/visual/capture.ts`.

**The final set came from a clean build.** `.next-e2e-visual` was deleted before
the run, so Playwright's `webServer` did a full `npm run build` into an empty
directory. This matters: `next dev` and `next build` share an output directory,
and a half-clobbered build produces convincing but fake runtime errors — a
corrupted build would have made me report design defects that do not exist.

| | |
|---|---|
| Screens | login · dashboard-grid · dashboard-list · detail · editor · quiz-question · quiz-result · search-suggestions · settings-popover · lightbox |
| Themes | light · dark |
| Viewports | `desktop` 1440×900 · `mobile` 390×844 (`isMobile`, `hasTouch`, DPR 3) |
| Total | **40 PNGs**, all 40 tests green on both projects |
| Path | `test-results/screenshots/<viewport>-<theme>-<screen>.png` — under `test-results-visual/` when `E2E_SLOT=visual`, which is what keeps a parallel agent's run from clearing them |

Stabilisation, so a shot depends on nothing but the design:

- one seeded database, never a note another spec created;
- `document.fonts.ready` awaited before every capture, so no shot catches a
  fallback face and gets filed as a typography defect;
- every `transition` and `animation` disabled, `scroll-behavior: auto`,
  `caret-color: transparent` on `contenteditable`, plus
  `prefers-reduced-motion: reduce` on the context;
- the quiz generator stubbed with fixed Vietnamese questions — the offline
  generator derives its wording from the note, which would change the shot
  every time the seed changes;
- the quiz *save* endpoint stubbed too, so finishing a quiz for a screenshot
  does not append an attempt to n1 and make the `detail` rail grow with every
  capture run;
- theme written through `PATCH /api/prefs` as well as the `kn_prefs` cookie and
  `localStorage`. All three are needed: the cookie drives the server render,
  `localStorage` drives `ThemeScript` before first paint, and Postgres wins on
  every subsequent render for a signed-in visitor. Each test asserts
  `html[data-theme]` before it shoots, so a light shot can never be filed as
  dark.

Relative timestamps are **not** frozen. The seed dates are day offsets, so
labels like "3 ngày trước" and "17/09/2026" are stable for hours; the four
captures of one screen always come from a single run, so they agree with each
other.

### What was measured rather than eyeballed

Colour, type and geometry claims below come from `getComputedStyle` in the
running page, not from reading pixels. A screenshot cannot tell you that
`--accent` is `#17756b` rather than something one step off, and Vietnamese
diacritics at 12px do not survive a downscaled PNG well enough to judge a font
stack. Eyes were used for layout, reflow, overflow, clipping and copy.

---

## Defect list, by severity

Five defects were found. All five were reported as they were found and **all
five are now fixed and re-verified in a fresh capture**; none are outstanding.

| # | Severity | Screen(s) | Defect | Status |
|---|---|---|---|---|
| 1 | **Critical** | detail | Highlighting was inert — the bubble appeared, clicking "Đánh dấu" did nothing | Fixed, `0d9d614` |
| 2 | **High** | detail, editor | Every bullet and ordered-list number in note bodies was invisible | Fixed, `a28fe05` |
| 3 | **High** | detail, quiz, lightbox (mobile) | 27px of horizontal page scroll at 390px | Fixed, `47e2768` |
| 4 | **Medium** | detail | Every seeded comment was attributed to "?" | Fixed, `a28fe05` |
| 5 | **Medium** | quiz-question | Question line-height 1.5 instead of the specified 1.35 | Fixed, `47e2768` |

### 1 — Critical · highlighting did not work at all

**Spec.** §07 S3: "Bôi đen → Đánh dấu; click đoạn đánh dấu → Bỏ đánh dấu (không
tạo phiên bản)." §1.3 item 21.

**Observed.** With a real `page.mouse` drag over a paragraph, the
`[data-hlpop][data-mode="add"]` bubble appeared in the right place, and clicking
"Đánh dấu" did nothing — no `<mark>`, no rail entry, nothing persisted. `PUT
/api/notes/n1/highlights` was still sent and returned 200, but its body was the
unchanged content. Removing an existing highlight failed the same way.

**Cause.** Every re-render of `DetailClient` replaced all children of
`[data-prose]`. A MutationObserver on the prose root counted exactly one
`childList` rewrite per re-render — opening the bubble +1, closing it +1 — while
the `<div data-prose>` element itself stayed the same node. That detached the
live `Range` held in `useHighlight`'s `pendingRange` ref, so `wrapRange` walked a
dead range and wrapped nothing.

Proof the HTML string was unchanged and React re-applied it anyway: inserting
`<mark data-hl="manual">XYZ</mark>` by hand and then triggering one re-render
that cannot change `shownContent` (clicking the seeded mark) removed the manual
mark. React 19's `updateProperties` decides a prop changed by identity, and
`src/components/shared/prose.tsx` wrote `dangerouslySetInnerHTML={{ __html: html }}`
— a fresh object every render. React 18 compared the `__html` strings, which is
why the pattern used to be safe.

**Fix.** `useMemo(() => ({ __html: html }), [html])` plus `memo(ProseImpl)`.
Verified end to end: innerHTML writes per unrelated re-render 1 → 0, add takes
marks 1 → 2 with 2 marks in the PUT body, remove takes them back to 1, and the
version count stays 3 → 3 throughout.

### 2 — High · bullets and numbers invisible in every note body

**Spec.** §02 `proseRules`: `ul, ol` → "padding-left 1.35em, margin 0 0 1em";
`li` → "margin .28em 0, padding-left .2em, **::marker accent**". The prototype
contains no `list-style` declaration anywhere, so it renders browser-default
discs and decimals.

**Observed.** Computed `list-style-type: none` on both `[data-prose] ul` and
`[data-prose] ol`. Tailwind v4's preflight resets `ol, ul { list-style: none }`
and `globals.css` restored the padding but not the marker, so
`[data-prose] li::marker { color: var(--accent) }` was tinting a marker that was
never drawn.

Not cosmetic. n1's "Lựa chọn thuốc khởi đầu" is an ordered list whose whole
meaning is that it is a sequence, and it rendered as four indented sentences.
"Đọc ECG trong 10 bước" is a ten-step `<ol>` that showed no step numbers at all.
The editor's `•` and `1.` toolbar buttons produced invisible markers too.

**Fix.** `list-style: disc` / `decimal` restored on the existing rule. The
markers now render in `--accent` in both themes.

### 3 — High · horizontal page scroll at 390px on the detail screen

**Spec.** §03 layout, and the review checklist: no horizontal scrollbar at 390px.

**Observed.** `document.documentElement.scrollWidth` was **417** against a 390
viewport on `/notes/n1`. Every other route measured exactly 390. The offender was
the action group in `detail-actions.tsx`: the outer row was `flex flex-wrap`, but
the inner group holding Yêu thích / Xoá / Trắc nghiệm / Chỉnh sửa was a plain
`flex gap-6` that could not wrap, measured 400px, and ran from x=16 to x=416.
The mobile detail screenshots were 417 CSS px wide and the "Chỉnh sửa" button was
clipped at the right edge. It also affected quiz and lightbox, captured on the
same page.

**Fix.** `flex-wrap` on the inner group. All five app routes now measure exactly
390, and the action row wraps to two tidy rows.

### 4 — Medium · seeded comments attributed to "?"

**Spec.** The prototype renders a real author:
`<span style="font-weight:500;color:var(--text);font-size:13px">Bác sĩ</span>`
with a `BS` avatar. Contracts §3 item 3 requires `NoteComment.author` because the
app is multi-user.

**Observed.** Both comments on n1 rendered a circular avatar containing `?` and a
byline reading `? · 2 ngày trước`, in both themes and both viewports.
`seed-data.ts` built comments as `{ id, text, date }` with no `author`, so
`comments-section.tsx` fell back to `UNKNOWN_AUTHOR = { displayName: '?' }`. The
fallback is correct — contracts §6 forbids a hard-coded "BS" — but the seed
should never have been exercising it, and a question mark sat where the author
belongs on the flagship demo note.

**Fix.** Seeded comments now carry the demo user as their author; they render
"Bác sĩ" with a "BS" avatar.

### 5 — Medium · quiz question set 11% looser than specified

**Spec.** §02: "Câu hỏi quiz — Serif 28/600 (mobile 22) · **lh 1.35** · -0.01em".

**Observed.** 42px on a 28px font = **1.5** on desktop; mobile was correct at
1.35. The source in `quiz-modal.tsx` declared `leading-[1.35]`, but the rendered
`class` attribute was `m-0 font-serif font-semibold tracking-[-.01em]
[text-wrap:pretty] text-28` — the leading had been stripped.

**Cause.** `cn()` is `twMerge(clsx(...))`, and stock tailwind-merge makes
`font-size` evict `leading-*`, because Tailwind v4's `text-lg/7` shorthand sets
both. A later `text-28` therefore deleted an earlier `leading-[1.35]`. The
failure is silent: no warning, no visual clue except a slightly loose heading.

**Fix.** Taken at the root rather than the call site —
`extendTailwindMerge({ override: { conflictingClassGroups: { 'font-size': [] } } })`.
The shorthand is used nowhere in `src/` and the sizes are literal pixels, so the
rule could only ever drop a line-height silently. Reordering the one string would
have left the trap armed. The computed ratio is now 1.35 at both 22px and 28px.

I swept for other instances: every `cn(...)` call in `src/` containing a
`leading-[…]` followed by a `text-NN` (one hit, this one), and every element on
`/`, `/?view=list`, `/notes/n1`, `/notes/n1/edit`, `/login` and
`/settings/api-keys` that declares a `leading-[x]`, comparing declared against
computed. All correct.

---

## Token and type verification

Read from `getComputedStyle` on the running page, both themes.

**Colour — all 22 tokens match §01 exactly**, light / dark:

`--bg` `#f6f6f3` / `#0f1112` · `--surface` `#ffffff` / `#16191a` · `--surface2`
`#f0f0ec` / `#1d2122` · `--line` `#e5e4df` / `#252a2b` · `--line2` `#d3d2cb` /
`#343a3c` · `--text` `#1a1c1e` / `#e6e7e5` · `--muted` `#63676c` / `#9ca1a5` ·
`--faint` `#989ca1` / `#6b7175` · `--accent` `#17756b` / `#5cc3b3` ·
`--accent-ink` `#ffffff` / `#0c1a18` · `--accent-soft` `#e2efec` / `#15302c` ·
`--hi` `#b3382e` / `#f0897e` · `--hi-soft` `#f8e7e4` / `#391f1c` · `--med`
`#9c630f` / `#e2b35f` · `--med-soft` `#f5ecda` / `#342a17` · `--low` `#5a6670` /
`#a4aeb5` · `--low-soft` `#eceeef` / `#242a2d` · `--ok` `#23794a` / `#6cc98f` ·
`--ok-soft` `#e3f2e8` / `#173022` · `--hl` `#fbe9a6` / `rgba(226,179,95,.28)` ·
`--hl2` `#f6db78` / `rgba(226,179,95,.42)` · `--fs` `17px`.

**Typography — matches §02:**

| Role | Spec | Measured |
|---|---|---|
| H1 dashboard | Serif 32/600 · 1.15 · -0.02em | 32px / 600 / 36.8px / -0.64px ✓ |
| Note title (detail, editor) | Serif 38/600 · 1.15 · -0.02em | 38px / 600 / 43.7px / -0.76px ✓ |
| Card title | Serif 20/600 · 1.3 · -0.01em | 20px / 600 / 26px / -0.2px ✓ |
| List row title | Serif 17/600 · 1.3 · ellipsis | 17px / 600 / 22.1px ✓ |
| Prose body | Serif `--fs` · 1.72 | 17px / 29.24px = 1.72 ✓ |
| Prose `h2` | Sans 1.12em/600 · -0.005em | 19.04px = 1.12em, sans, 600 ✓ |
| Quiz question | Serif 28/600 · 1.35 · -0.01em | 28px / 600 / 1.35 ✓ *(after defect 5)* |
| Quiz score | Serif 64/600 · lh 1 · -0.03em | ✓ |
| Section label | Sans 11–12/600 · UPPERCASE · .08em · faint | ✓ |
| Mono meta | IBM Plex Mono 11–13 | counters, `vN`, page numbers, `/` kbd ✓ |

Three families resolve correctly and none falls back: `"Source Serif 4"` on
titles, card and list titles, prose and the editor title; `"IBM Plex Sans"` on
body, nav, buttons and prose `h2`; `"IBM Plex Mono"` on counters, version labels,
pager numbers and the demo hint.

**Geometry — matches §03/§04:** card radius 14 with padding 18/20/16 and
min-height 200 · search box 42h r10 with a 560 max · header 64 · sidebar 256 ·
quiz modal on `--bg` at z-index 95 with a 64px header and a 3px accent progress
bar · quiz option r12 with a 26×26 r7 mono key tile · version item padding
10/10/10/8 r10 · editor body min-height 460 padding 32/40 · pagination current
page `--text` on `--bg`, 36×36, r8, mono 13/500 · empty state padding 80/24,
1px dashed `--line2`, r14.

---

## Screen by screen

Paths are relative to `test-results/screenshots/` (i.e.
`test-results-visual/screenshots/` when a slot is set).

### login — `{desktop,mobile}-{light,dark}-login.png`

Form 380 wide and centred at x=530 on a 1440 viewport, `gap 28`. Logo tile 40×40
r11 on `--accent` with a serif `K` in `--accent-ink` — SPEC §0's rename is
complete, the glyph is `K` and nothing anywhere says "Sổ Lâm Sàng". Title serif
32/600 at -0.02em; description 15 `--muted` reading "Sổ tay kiến thức cá nhân.
Đăng nhập để tiếp tục." — SPEC §0's wording, which deliberately drops the
prototype's "lâm sàng". Inputs 46h r10 with a 1px `--line2` border; labels 13/500
muted with `gap 6`. Submit is the ink variant: 46h r10, `--text` background,
`--bg` text, full width.

Dark inverts correctly: `#0f1112` page, `#16191a` inputs, `#5cc3b3` logo tile
with `#0c1a18` glyph, and the ink button becomes light-on-dark.

The mono 12 faint demo hint `Demo · bacsi / 123456` is **absent by design** —
contracts §4 renders it only when `NODE_ENV !== 'production'`, and the e2e
harness drives a production build. Not a defect; noted so nobody re-files it.

No defects.

### dashboard-grid — `{desktop,mobile}-{light,dark}-dashboard-grid.png`

Container max 1160 with 40/36 desktop padding and 16/20 on mobile. H1 serif 32
(26 mobile) with the "14 ghi chú" sub-line. Sort select is a custom component —
no native `<select>` anywhere, per §1.2 item 16 — beside the grid/list toggle.

Cards: r14, padding 18/20/16, min-height 200, `gap 16`; three columns at 1440
and exactly one at 390. Top row 28h with the priority label left and a 32×32 star
right; serif 20/600 title; 14/1.55 muted description clamped to two lines; up to
three tag chips; footer separated by a 1px `--line` rule carrying 12 faint meta
and a mono `vN`. Priority colours track the value — `--hi` for Cao, `--med` for
Trung bình — and a favourited star is filled `--med`.

`rel()` behaves: "4 giờ trước", "3 ngày trước", "6 ngày trước", then `17/09/2026`
once past seven days. Pagination reads `Hiển thị 1–6 trên 14` with 36×36 buttons
and the current page on `--text`.

Mobile reflows properly: drawer sidebar (header shows the menu button), sort and
view toggle drop to their own row, cards go single-column, gutters are 16.

No defects.

### dashboard-list — `{desktop,mobile}-{light,dark}-dashboard-list.png`

One `--surface` container at r14, rows separated by 1px `--line`, first row with
a transparent top border. Row padding 16/18, `gap 16`, 8px priority dot, serif 17
title, tag chips, and meta right-aligned in a `min-width: 150` column.

**Observation, not a defect.** At 390px the row wraps and the favourite star
lands alone on its own line, leaving a visible gap, while the title still
truncates with an ellipsis rather than wrapping. This is a faithful port: the
prototype sets `flex-wrap: {{ rowWrap }}` with `rowWrap: isMobile ? 'wrap' :
'nowrap'` and hard-codes `white-space:nowrap; text-overflow:ellipsis` on both the
title and the description regardless of viewport. So the implementation matches
the source exactly and the awkwardness is inherited. If the user would rather the
mobile row let its title wrap and keep the star on the first line, that is a
design change to the prototype, not a fidelity fix — worth one line of sign-off.

No defects.

### detail — `{desktop,mobile}-{light,dark}-detail.png`

Container max 1120; article 684 wide inside its 740 cap; rail 300 and sticky at
top 88 on desktop, stacked full-width below the article on mobile, `gap 56`.

Priority pill 26h r999 on `--hi-soft` reading "Ưu tiên cao", followed by `#`
tag chips. H1 serif 38 (28 mobile) with `text-wrap: balance`; description 17
`--muted`. Meta row "Cập nhật 4 giờ trước · v3" with a mono `v3`, above a 1px
`--line` rule with 20px padding below and a 28px margin.

Prose at `--fs` 17 and line-height 1.72; `h2` sans 1.12em/600; accent `::marker`
on discs and decimals; blockquote with a 2px `--accent` left border, italic,
`--muted`. The seeded `<mark data-hl="hseed1">` is `#fbe9a6` in light and the
translucent amber `rgba(226,179,95,.28)` in dark. Attached images use the 135°
striped placeholder in a `minmax(160px,1fr)` 4:3 grid with 12px gaps and captions
below.

Rail sections are separated by `pt-20 border-t --line` with uppercase faint
labels — LỊCH SỬ PHIÊN BẢN, LỊCH SỬ TRẮC NGHIỆM, ĐOẠN ĐÃ ĐÁNH DẤU, THÔNG TIN,
exactly §09's list. Version dots are 9px with a 2px ring and the current entry
reads "· hiện tại". The quiz history row shows `3/4 · 75%` with a `--med` bar,
correct for the 50–79 band. Comments show "Bác sĩ" with a "BS" avatar and a
`⌘/Ctrl + Enter để gửi` composer whose "Gửi" button is correctly dimmed while
empty.

Defects 1, 2, 3 and 4 all lived on this screen; all four are fixed and the
current capture is clean.

### editor — `{desktop,mobile}-{light,dark}-editor.png`

Title input is serif 38 (28 mobile) with `border-width: 0`; description is a
two-row textarea at 17/1.55 `--muted`. The toolbar is sticky under the header
with 32×32 r7 tools in groups separated by a 1px `--line` right border: `B` in
serif 700, `I` italic, `U` underlined, `S` struck through, then H2/H3/¶, then the
list, quote and rule tools, then undo/redo, then Ảnh. Editor body has
`min-height: 460` and padding 32/40 desktop, 20/18 mobile.

Panel: priority segmented on a `--surface2` track at r10 with `padding: 4` and
the selected item raised on `--surface` at r7 with `0 1px 2px rgba(0,0,0,.12)` —
the `--seg-shadow` from §04. Tag chips are `--accent-soft` with accent text and
an × each; six suggestions, the §06 maximum. Image grid is three columns; the
dropzone is 1px dashed `--line2` at r10 reading "Kéo thả ảnh vào đây / hoặc chọn
từ máy". Version-note input is 40h r10 with the §09 placeholder "VD: Cập nhật
liều theo ESC 2024" and the 12 faint hint below. Save reads **"Lưu v4"** for the
seeded three-version note — the next version number, as §07 S4 requires — at 38h
r9 with 18px padding.

On mobile the toolbar wraps to two rows and the panel stacks below the canvas.

No defects.

### quiz-question — `{desktop,mobile}-{light,dark}-quiz-question.png`

Captured mid-question with the first answer already picked, so one frame carries
all four option states plus the feedback block.

Full-screen `fixed inset-0` on `--bg` at z-index 95. Header 64 with a 32px
`--accent-soft` icon tile, "Trắc nghiệm" 14/600 over the note title in 12 faint,
a mono `1 / 5` counter and a 40px close button. Progress bar 3px on `--line` with
an `--accent` fill. Content column max 760 with 56px top padding (28 on mobile)
and 40/16 side padding.

Label `CÂU 1 / 5` in mono 12/500 `--accent`; question serif 28/600 (22 on
mobile). Options at r12 with 14/16 padding and `gap 10`, each with a 26×26 r7
mono 12/600 key tile. State colours are exact: correct `--ok` border on
`--ok-soft` with an `--ok` key tile and the verdict "Đúng"; incorrect `--hi` on
`--hi-soft` with "Sai"; untouched options fall back to `--line` on `--surface`
with a `--surface2` key. Feedback block is `--hi-soft` at r12 with 16/18 padding,
a 14/600 `--hi` title reading "Chưa đúng — đáp án là A" and a 15/1.6 explanation.
Footer hint "Phím 1–4 để chọn · Enter để tiếp tục" in 12 faint beside a 44h r10
primary "Câu tiếp theo".

Every string matches §09 verbatim. Defect 5 lived here and is fixed.

### quiz-result — `{desktop,mobile}-{light,dark}-quiz-result.png`

Section label "HOÀN THÀNH", score in serif 64/600 at -0.03em, then
"40% · Nên đọc lại ghi chú" — the correct band for 40% under §01's ≥80 / ≥50 / <50
rule, and coloured `--hi` to match. Completion stamp in 14 `--muted`. Buttons
"Làm bộ câu hỏi mới" (primary 42h) and "Về ghi chú" (secondary with a `--line2`
border). Header counter switches to "5 câu" and the progress bar fills to 100%.

"XEM LẠI ĐÁP ÁN" lists every question in an r12 `--surface` card with a 24px
circular ✓ on `--ok-soft` or ✕ on `--hi-soft`, a serif 16/600 question, "Bạn
chọn:" in 14 muted with the pick coloured by correctness, "Đáp án đúng:" in
`--ok` when wrong, and the explanation in 13 muted. The ✓/✕ are the text glyphs
§06 specifies, not emoji — contracts §6 holds.

No defects.

### search-suggestions — `{desktop,mobile}-{light,dark}-search-suggestions.png`

Captured in the idle state with one recent term seeded, so all three sections are
visible at once.

Search box border turns `--accent` while open; panel sits at `top: 48`, r12, 1px
`--line`, `--surface`, `--shadow`, `padding 8`, capped at `min(480px, 72vh)` with
its own scroll. Sections are §09 verbatim: "Tìm gần đây" with a "Xoá" text link
and history-icon rows, "Thẻ" with eight `#tag` chips carrying mono counts, and
"Mở gần đây" with four note rows. Each note row has a 7px priority dot in the
note's real colour and a serif 15/600 title over a `#tag #tag · 4 giờ trước`
sub-line.

**Observation, not a defect.** At 390px the panel is only as wide as the search
box, which is itself squeezed between the menu button and the Aa button, so note
titles truncate around twenty characters and tag chips fall one per line. This is
exact fidelity: the prototype uses `position:absolute; left:0; right:0; top:48px`
on the same box, so the port matches. Widening it on mobile would be a design
change.

No defects.

### settings-popover — `{desktop,mobile}-{light,dark}-settings-popover.png`

Trigger is the 40h min-w-40 r10 `Aa` button with a 1px `--line` border, serif
17/600 `A` plus a 12px `a`. Panel is 288 wide at r14 with `padding 18` and
`gap 20`, right-aligned to the trigger — and it still fits inside 390 on mobile.

Contents match §07 S6: a 12/500 muted "Giao diện" label over a two-column
segmented Sáng/Tối with sun and moon icons and the active item raised; "Cỡ chữ
nội dung" with the current `17px` on the right, a 14–22 range input with
`accent-color: var(--accent)` flanked by 30×30 r8 A buttons, and a live preview
on `--surface2`; then a `--line` divider and a "Đăng xuất" row with its icon.

The dark capture confirms the dark theme genuinely applies through the whole
page, not just the popover.

No defects.

### lightbox — `{desktop,mobile}-{light,dark}-lightbox.png`

`fixed inset-0` on `rgba(8,9,10,.88)` at z-index 100. The seeded image has an
empty `src`, so it correctly falls back to the 135° striped placeholder at
`min(80vw, 900px)` in 4:3 — measured 894×661 on desktop. Close button 40 at r10
in the top-right corner. Caption row shows the label followed by a mono `1 / 2`,
with 36px chevrons on either side because the note has two images.

The overlay is identical in both themes, which is right: §06 fixes it in absolute
colours rather than tokens.

No defects.

---

## Global checks

| Check | Result |
|---|---|
| Background `#f6f6f3` / `#0f1112`, surfaces `#ffffff` / `#16191a` | ✓ measured |
| Accent `#17756b` / `#5cc3b3` on buttons, links, markers, quote bars, progress | ✓ measured |
| Body / muted / faint text tokens | ✓ measured |
| Source Serif 4, IBM Plex Sans, IBM Plex Mono — no fallback rendering | ✓ measured |
| Section labels UPPERCASE, 11–12px, 600, `.08em`, faint | ✓ |
| Nothing reads "Sổ Lâm Sàng"; logo glyph is `K` | ✓ all 40 shots |
| No emoji anywhere; icons are `<Icon>` SVGs | ✓ (`✓`/`✕` in the quiz review are the text glyphs §06 asks for) |
| No horizontal scrollbar at 390px | ✓ after defect 3 — all five routes measure exactly 390 |
| No clipped text, no invisible-on-dark text | ✓ |
| Vietnamese copy matches §09 | ✓ verbatim, including "Xem tất cả kết quả cho …", "Không có gợi ý cho …", "Chưa đúng — đáp án là X", "Nắm vững / Cần ôn thêm / Nên đọc lại ghi chú" and the empty state |

---

## Deviations from the spec that are deliberate

Recorded so they are decisions rather than oversights.

1. **Login description.** §09 says "Sổ tay kiến thức lâm sàng cá nhân. Đăng nhập
   để tiếp tục."; the app says "Sổ tay kiến thức cá nhân. …". SPEC §0 overrides
   §09 here, deliberately dropping "lâm sàng" because the product is no longer
   single-speciality. Correct as built.

2. **Avatar initials.** SPEC §0 says "2 ký tự đầu của `displayName`", which for
   "Bác sĩ" gives `BÁ`. The app renders word initials, `BS`, matching the
   prototype's hard-coded avatar and reading correctly for a name like "Nguyễn
   Văn An" (`NA` rather than `NG`). Worth one line of confirmation from the user;
   I would keep the current behaviour.

3. **Demo hint absent.** `Demo · bacsi / 123456` is dev-only by contracts §4, so
   it never appears in a production-build screenshot.

---

## Verdict

**The build matches the design spec.** Every colour token, type role, radius,
shadow and spacing value I measured resolves to the exact value in
`Design Spec.dc.html`, in both themes; the mobile layout genuinely reflows rather
than merely shrinking — drawer sidebar, stacked rail, one-column grid, wrapped
toolbar, 16px gutters; and the Vietnamese copy is §09 verbatim.

Five defects were found and all five are fixed. One of them was serious enough to
be worth the whole exercise: highlighting, a headline feature from §1.3, did not
work at all in a real browser, and no unit test could see it because the failure
lived in the interaction between React 19's prop diffing and a live DOM `Range`.
Two more — invisible list markers and a 27px horizontal scroll on mobile — were
the kind of thing that only a screenshot review catches.

A sixth bug surfaced during the review and is **not** visual, so it is not in the
table above, but it is recorded here because these screenshots are how it was
first caught. `router.push` / `router.replace` called from an event handler that
has already queued React state updates was dropped outright 20–70% of the time —
the router was called with the correct href and `history.pushState` /
`replaceState` never fired. Enter in the search box, the tag chips and the
grid/list toggle intermittently did nothing, while the term was still saved to
"Tìm gần đây", so the app looked like it had reacted and then went nowhere.

A successful navigation lands in 9–28 ms and a dropped one never lands at all, so
it is not latency. The one control that never failed is a real `<Link>`, which
takes no state update first — which places the trigger in the
state-update-then-navigate shape rather than in the router. `<Link>` prefetching,
the debounced prefs write, `flushSync`, requesting the navigation from an effect,
a single `startTransition` around the whole handler, and hydration timing were
each measured and ruled out; two of them made it worse.

**Fixed** by `useVerifiedNavigate()` in `src/lib/nav/navigate.ts`, used by
`useNoteFilters`: it issues the navigation, then checks whether the URL actually
changed and re-issues with escalating backoff (100/200/400/800/1200 ms) until it
has, stopping as soon as the URL matches. Measured 40/40 twice under the load
that previously gave 22–27/40.

That wrapper is deliberate, not a leftover. The underlying defect is upstream, in
how Next commits a navigation inside a React transition, so there is nothing in
this codebase left to fix; the wrapper is the containment and should stay until
the upstream behaviour changes. `e2e/search.spec.ts` asserts the correct
behaviour directly, with no `test.fail()` and no retry workaround, so it will
report honestly if the wrapper ever stops being enough.
