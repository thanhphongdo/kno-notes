# Kết nối Kno-Notes MCP với Codex

Hướng dẫn này kết nối Codex với Kno-Notes đang chạy trên Vercel. Mỗi người nên tạo **API key riêng trong tài khoản của mình**. Key cấp quyền đọc và ghi các ghi chú thuộc tài khoản tạo key; không chia sẻ key cá nhân qua chat, email hoặc file.

## 1. Tạo API key

1. Đăng nhập vào [Kno-Notes](https://kno-notes.vercel.app).
2. Mở **Cài đặt → API keys** (`/settings/api-keys`).
3. Chọn **Tạo khoá mới**, đặt tên, rồi sao chép key ngay. Key chỉ hiển thị một lần.

## 2. Thêm server vào Codex

Mở Terminal. Chạy lệnh sau để lưu cấu hình MCP toàn cục:

```sh
codex mcp add kno-notes \
  --url https://kno-notes.vercel.app/api/mcp \
  --bearer-token-env-var KNO_NOTES_API_KEY
```

Codex sẽ đọc key từ biến môi trường `KNO_NOTES_API_KEY`; key không nằm trong file cấu hình hoặc repo.

## 3. Cấp biến môi trường cho Codex trên macOS

Trong Terminal, nhập lệnh sau. Khi được nhắc, dán API key vừa tạo; ký tự sẽ không hiện trên màn hình:

```zsh
read -s "KNO_NOTES_API_KEY?Dán API key Kno-Notes: "
launchctl setenv KNO_NOTES_API_KEY "$KNO_NOTES_API_KEY"
unset KNO_NOTES_API_KEY
```

Thoát Codex hoàn toàn rồi mở lại. Biến môi trường được lưu trong phiên đăng nhập macOS hiện tại; sau khi đăng xuất hoặc khởi động lại máy, hãy chạy lại lệnh này.

## 4. Xác nhận kết nối

Trong Terminal, chạy:

```sh
codex mcp get kno-notes
```

Cấu hình cần hiển thị URL `https://kno-notes.vercel.app/api/mcp` và biến `KNO_NOTES_API_KEY`. Trong Codex, bắt đầu phiên mới nếu server chưa xuất hiện; server cung cấp công cụ như `list_notes`, `get_note`, `create_note`, `update_note` và các công cụ quiz.

## Bảo mật

- Không điền API key thật vào file Markdown này, repo, hoặc tin nhắn gửi cho người khác.
- Người nhận tài liệu cần tạo key riêng trong tài khoản Kno-Notes của họ. Dùng chung một key sẽ cho mọi người cùng quyền trên dữ liệu của tài khoản sở hữu key.
- Nếu key bị lộ, thu hồi tại **Cài đặt → API keys** và tạo key mới.
