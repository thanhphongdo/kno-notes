---
name: kno-notes-publish
description: Đưa một tài liệu nguồn (PDF, DOCX, trang research, bản chép tay, hoặc nội dung vừa nghiên cứu trong phiên làm việc) lên Kno-Notes thành MỘT ghi chú hoàn chỉnh — nội dung gốc giữ nguyên và được format đẹp, kèm bài trình chiếu và bộ câu hỏi trắc nghiệm. Dùng khi người dùng nói "đẩy lên Kno-Notes", "push note", "làm slide từ cái này", "tạo quiz từ tài liệu này", hoặc đưa một file và bảo xuất bản.
---

# Xuất bản lên Kno-Notes

Một lần chạy tạo ra ba thứ cho cùng một ghi chú: **nội dung gốc**, **bài trình chiếu**, **bộ câu hỏi**. Không tách thành ba lần.

## Nguyên tắc không được vi phạm

**Nội dung gốc phải còn nguyên.** Bạn được phép format lại — thêm heading, tách đoạn, dựng bảng, đánh dấu danh sách — nhưng KHÔNG được tóm tắt, rút gọn, bỏ ví dụ, bỏ số liệu, bỏ chú thích hay "viết lại cho gọn" phần nội dung chính. Người dùng đẩy tài liệu lên để giữ nó, không phải để nhận về một bản tóm tắt. Chỉ bài trình chiếu mới được cô đọng.

Nếu tài liệu dài hơn mức một lần gọi tool chịu được, hãy `create_note` với phần đầu rồi `update_note` nối tiếp, chứ đừng cắt bớt.

## Quy trình

### 1. Đọc nguồn

Đọc hết tài liệu trước khi viết bất cứ thứ gì. Với PDF/DOCX, trích cả phần chú thích ảnh và bảng. Với bản chép tay đã được người dùng gõ lại hoặc mô tả, bám sát chữ của họ — đừng "chuẩn hoá" thuật ngữ họ đang dùng.

Nếu tài liệu có hình và người dùng muốn giữ, nói rõ với họ rằng ảnh cần được tải lên riêng qua giao diện Kno-Notes; tool MCP không nhận ảnh.

### 2. Hỏi người dùng chọn (BẮT BUỘC, trước khi push)

Hiện ra một tin nhắn chọn lựa gọn gàng, rồi **dừng chờ trả lời**. Đừng push trước khi có câu trả lời, trừ khi họ đã nói "auto" ngay từ đầu.

```
Trước khi đẩy lên, chọn giúp tôi:

Template trình chiếu
  1. editorial  — một cột, chữ lớn, nhịp đọc chậm; hợp bài lý thuyết dài
  2. deck       — bố cục slide hội thảo, tiêu đề mạnh, ý ngắn; hợp trình bày trước nhóm
  3. clinical   — dày thông tin, hai cột, bảng và số liệu; hợp quy trình, phác đồ

Brand kit
  1. mint     — xanh ngọc của Kno-Notes
  2. midnight — nền tối sâu, chữ sáng
  3. paper    — giấy ấm, mực đen
  4. clinic   — trắng lạnh, xanh y tế

Số câu trắc nghiệm: 10 / 20 / 30 / 50

Hoặc trả lời "auto" để tôi tự chọn.
```

**Khi người dùng chọn "auto"**, quyết định theo nội dung, rồi nói ra lựa chọn của mình kèm một câu lý do:
- Bài lý thuyết, nhiều đoạn văn dài → `editorial`.
- Bài để trình bày, nhiều ý rời → `deck`.
- Quy trình, phác đồ, bảng phân loại, nhiều số → `clinical`.
- Brand kit mặc định `mint`, trừ khi tài liệu có tông riêng rõ rệt.
- Số câu: khoảng 1 câu cho mỗi 2 trang nội dung, tối thiểu 10, tối đa 50.

### 3. Dựng nội dung ghi chú

HTML đơn giản, chỉ dùng: `h2`, `h3`, `p`, `ul`/`ol`/`li`, `blockquote`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `strong`, `em`.

- `h2` cho chương lớn, `h3` cho mục con. Đừng dùng `h1` — tiêu đề ghi chú đã là h1.
- Bảng trong tài liệu gốc phải ra bảng, đừng biến thành gạch đầu dòng.
- `desc`: 1–2 câu nói bài này có gì, hiện trên thẻ ghi chú ngoài trang chủ.
- `tags`: 3–6 thẻ tiếng Việt, dùng lại thẻ đã có nếu hợp — gọi `list_tags` để xem danh sách trước.
- `priority`: `high` nếu người dùng nói cần ôn gấp, còn lại `medium`.

### 4. Dựng bài trình chiếu

Đây là phần DUY NHẤT được cô đọng — nhưng phải đủ trọng tâm: ai xem hết slide mà không đọc bài gốc vẫn phải nắm được ý chính, kết luận, và những con số quan trọng.

#### Trình chiếu Kno-Notes làm được những gì

**Tám layout.** Mỗi slide chọn đúng một, qua trường `layout`:

| layout | Trường | Dùng khi |
|---|---|---|
| `title` | title, subtitle?, kicker?, icon? | Slide mở đầu |
| `section` | title, icon? | Vách ngăn giữa các chương |
| `bullets` | title, bullets (1–8), icon? | Liệt kê ý |
| `two-col` | title, left, right — mỗi cột `{heading?, bullets (1–6)}` | So sánh hai thứ cạnh nhau |
| `image` | imageId, title?, caption?, bullets? | Phim, sơ đồ, hình minh hoạ |
| `quote` | text (≤600), attribution? | Trích dẫn, định nghĩa kinh điển, tiêu chuẩn |
| `stat` | value (≤24), label, support? | Một con số cần được nhìn thấy |
| `end` | title, subtitle?, icon? | Slide kết |

**Ba mẫu** (`template`) — khác nhau về bố cục, không phải màu:
- `editorial` — như trang sách: lề rộng, chữ serif lớn canh trái, không khung. Hợp lý thuyết dài, đọc chậm.
- `deck` — như sân khấu: dải màu đầu slide, tiêu đề canh giữa, nội dung thành thẻ. Hợp khi đứng nói trước nhóm.
- `clinical` — như tờ phiếu đọc phim: cột nhãn mono, các hàng kẻ mảnh, dày thông tin. Hợp quy trình, phác đồ, bảng phân loại.

**Bốn bộ màu** (`brandKit`): `mint` (xanh ngọc của app) · `midnight` (nền sâu, chữ sáng) · `paper` (giấy ấm, mực đen) · `clinic` (trắng lạnh, xanh y tế). Bộ nào cũng có sẵn bản sáng và tối, app tự đổi theo máy người xem.

**Mười tám icon** (`icon`), chỉ dùng tên trong danh sách này:

```
alert  check  info  question  target  clock  chart  compare  layers
list   book   idea  heart     lungs   bone   scan   stethoscope  pill
```

Icon đặt được ở hai nơi: cấp slide (`"icon": "lungs"`), và cấp từng gạch đầu dòng. Một gạch đầu dòng viết được theo hai cách:

```json
"bullets": [
  "Viết trần như thế này là bình thường",
  { "text": "Có icon khi dòng này cần được chú ý", "icon": "alert" }
]
```

**Hai mươi nền** (`pattern`), cộng `none`. Tất cả đều rất nhẹ và tự đổi theo bộ màu. Bỏ trống thì mẫu tự chọn cái hợp với nó.

*Nhóm rìa* — hoa văn nằm ở mép và góc, giữa trang trống hoàn toàn. An toàn nhất cho bài nhiều chữ:

| Tên | Trông như |
|---|---|
| `corner-brackets` | bốn dấu cắt nhà in ở góc |
| `edge-ticks` | thước chia vạch sát mép |
| `margin-rule` | lề sổ tay kẻ dọc |
| `frame-inset` | khung mảnh thụt vào |
| `corner-contour` | đường bình độ dồn ở góc |
| `corner-fan` | nan quạt toả từ góc |
| `side-pinstripe` | mành kẻ dọc hai bên |
| `edge-weave` | vân dệt ở mép trên dưới |

*Nhóm phủ* — trải khắp trang nhưng đã moi rỗng vùng chữ:

| Tên | Trông như |
|---|---|
| `paper-fiber` | sớ giấy dó |
| `linen-weave` | lưới vải mịn |
| `terrain-contour` | đảo bình độ |
| `wave-field` | sóng mảnh phía dưới |
| `ecg-baseline` | đường điện tim chạy thấp |
| `concentric-arc` | vòng tròn đồng tâm |
| `halftone-drift` | chấm bán sắc thưa dần |
| `mesh-wash` | vệt màu dịu ở ba góc |
| `color-block` | khối màu cắt chéo |
| `radiograph-grid` | lưới toạ độ phim X-quang |
| `stone-vein` | vân đá mài |
| `bokeh-soft` | vòng sáng nhoè ở rìa |

Chọn nền thế nào: bài nhiều chữ thì lấy **nhóm rìa**. `color-block` là mẫu đậm nhất, dùng dè. `ecg-baseline` và `radiograph-grid` gợi đúng không khí y khoa mà không rơi vào minh hoạ lộ liễu.

**Ba mức chuyển động** (`motion`): `full` (mặc định, mỗi layout có nhịp vào riêng) · `subtle` (chỉ mờ dần) · `none`. Máy nào bật chế độ giảm chuyển động thì app tự tắt hết, bất kể chọn gì.

**Lưu ý về quyền quyết định.** `template` là của bạn và người xem KHÔNG đổi được — nó là bố cục, bài viết cho bố cục này đặt sang bố cục kia sẽ vỡ. Nên hãy chọn mẫu theo dạng nội dung, đừng chọn theo cảm tính. Ngược lại `brandKit`, `pattern`, `motion` chỉ là **mặc định**: người xem đổi được và app nhớ lựa chọn của họ. Vẫn nên chọn cho tử tế — đó là thứ họ thấy đầu tiên — nhưng đừng cân nhắc quá lâu.

#### Soạn thế nào cho đẹp

- Mở bằng `title`, đóng bằng `end`. Mỗi chương lớn mở bằng một `section`.
- `bullets`: tối đa 6 dòng dù sức chứa là 8, mỗi dòng một ý, dưới 14 từ. Đừng nhồi cả đoạn văn vào một gạch đầu dòng.
- **Icon dùng cho thưa.** Nó là điểm nhấn, không phải trang trí. Một slide 6 dòng mà dòng nào cũng có icon thì rối và mất tác dụng — hãy để icon cho dòng cảnh báo, dòng kết luận, dòng dễ bỏ sót. Quy ước hợp lý: `alert` cho bẫy chẩn đoán, `check` cho tiêu chuẩn đạt, `target` cho mục tiêu, `clock` cho mốc thời gian, `compare` cho đối chiếu.
- Icon cấp slide hợp nhất ở `section` và `stat`, để mắt người xem bám được mạch bài.
- Số liệu quan trọng tách thành `stat` để nó được nhìn thấy; đừng chôn con số giữa một gạch đầu dòng.
- So sánh hai thứ thì dùng `two-col`, đừng ép vào bullets.
- Xen nhịp: đừng để 5 slide `bullets` liên tiếp. Chèn `stat`, `quote` hoặc `image` cho mắt được nghỉ.
- Độ dài hợp lý: 12–25 slide. Dưới 8 là mỏng, trên 40 là không ai xem hết.
- Tiếng Việt, không emoji — icon đã thay vai trò đó.

### 5. Dựng câu hỏi

- Đúng 4 lựa chọn mỗi câu, một đáp án đúng, các phương án sai phải hợp lý — đừng để ba phương án sai lộ liễu.
- `explain` 1–2 câu, chỉ ra chỗ trong bài chứa đáp án.
- Hỏi về nội dung CỦA BÀI, không hỏi kiến thức ngoài bài.
- Rải đều theo các chương, đừng dồn hết vào phần đầu.
- Đừng xáo trộn vị trí đáp án đúng theo kiểu máy móc — Kno-Notes tự xáo lại mỗi lần làm bài.

### 6. Push

Một lần `create_note` mang theo cả `questions` và `presentation`. Nếu nội dung quá dài phải chia, thì `create_note` trước rồi `update_note` nối, và chỉ gắn `presentation` + `questions` ở lần gọi cuối.

Với ghi chú đã có sẵn trên Kno-Notes, dùng `update_note`, `set_presentation`, `set_quiz_questions` — và nhớ: trường nào không truyền thì giữ nguyên, không bị xoá.

### 7. Báo lại

Đưa người dùng: tiêu đề, link `https://kno-notes.vercel.app/notes/<id>`, số slide, số câu hỏi, template và brand kit đã dùng. Một đoạn ngắn, không bảng biểu rườm rà.

## Khi có trục trặc

- **Tool báo lỗi xác thực** → API key chưa cắm hoặc hết hạn. Xem `docs/codex-mcp-setup.md` trong repo Kno-Notes.
- **Ghi chú đẩy lên xong mà mở không được** → báo người dùng kèm id; đừng tự tạo lại bài mới, bản gốc vẫn còn.
- **Không chắc một chi tiết trong tài liệu** → hỏi, đừng đoán rồi viết vào ghi chú như thể chắc chắn.
