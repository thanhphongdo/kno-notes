# Chế độ trình chiếu — quyết định thiết kế

Tài liệu này chốt những gì đã quyết, cho người dựng giao diện đọc trước khi viết code.
Hợp đồng dữ liệu nằm ở `src/lib/presentation/schema.ts`; mô tả cho Codex/Claude nằm
trong `PRESENTATION_GUIDE` (`src/lib/mcp/tools.ts`) và `.codex/skills/kno-notes-publish/SKILL.md`.

## Ai quyết cái gì

Bộ slide do Codex/Claude sinh ra mang theo `template`, `brandKit`, `pattern`, `motion`.
Nhưng không phải cái nào người xem cũng được đụng:

| Trường | Người soạn (qua MCP) | Người xem |
|---|---|---|
| `template` | quyết, và là quyết định cuối | **không đổi được** |
| `brandKit` | đặt mặc định | đổi được |
| `pattern` (nền) | đặt mặc định | đổi được |
| `motion` | đặt mặc định | đổi được |

**Vì sao `template` khoá còn lại thì không.** Mẫu không phải trang trí: người soạn chọn
`clinical` vì bài là phác đồ nhiều bảng, chọn `editorial` vì bài là lý thuyết đọc chậm.
Đổi mẫu là đổi bố cục, và một bài viết cho bố cục này đặt sang bố cục kia sẽ vỡ —
hai cột thành một, bảng thành danh sách. Còn bộ màu, hoa văn nền và mức chuyển động
thì không chạm vào cấu trúc, chỉ là khẩu vị của người đang ngồi xem.

## Lựa chọn của người xem được nhớ lại

Người xem đổi bộ màu / nền / chuyển động thì lựa chọn đó được ghi vào `localStorage`
và áp cho **mọi bài** họ mở sau đó, không riêng bài đang xem.

Lý do chọn phạm vi toàn cục thay vì nhớ theo từng bài: đây là sở thích của một người
(thích nền tối, mắt mỏi nên tắt chuyển động), không phải thuộc tính của bài. Nhớ theo
từng bài sẽ bắt họ chỉnh lại ở mỗi bài mới.

Hệ quả phải xử lý đàng hoàng:

- Thanh điều khiển có mục **"Về mặc định của bài"** để bỏ lựa chọn cá nhân và quay lại
  đúng những gì người soạn đã chọn. Không có nút này thì người dùng bị kẹt vĩnh viễn
  trong lựa chọn cũ mà không hiểu vì sao bài mới trông không như người soạn nói.
- Khi lựa chọn cá nhân đang đè lên mặc định của bài, giao diện phải cho thấy điều đó —
  một dòng chữ nhỏ là đủ, đừng để người dùng tưởng người soạn chọn màu này.
- `localStorage` đọc/ghi phải bọc trong `try/catch` và trang phải chạy đúng khi nó
  trống hoặc ném lỗi (cửa sổ ẩn danh, trình duyệt chặn site data). Thiếu giá trị đã
  lưu nghĩa là dùng mặc định của bài, không phải lỗi.
- `motion`: `prefers-reduced-motion: reduce` của hệ điều hành **luôn thắng**, kể cả khi
  người dùng tự chọn `full`. Đó là thiết lập trợ năng, không phải khẩu vị.

Khoá lưu trữ: một bản ghi duy nhất, scope theo người dùng như các khoá khác của app
(xem `src/lib/offline/keys.ts` để theo cùng quy ước), chứa `{ brandKit?, pattern?, motion? }`.
Trường nào không có nghĩa là "theo bài".

## Những gì đã chốt ở phần khác

- Ba mẫu: `editorial` (trang sách) · `deck` (sân khấu) · `clinical` (phiếu đọc phim).
- Bốn bộ màu: `mint` · `midnight` · `paper` · `clinic`, mỗi bộ có bản sáng và tối.
- Mười tám icon, dùng thưa — xem danh sách trong schema.
- Nền: danh sách tên là enum đóng, chốt sau khi khách duyệt bộ 20 mẫu.
- Chuyển động: `full` / `subtle` / `none`, mỗi layout một nhịp vào riêng, đều dưới 440ms.
