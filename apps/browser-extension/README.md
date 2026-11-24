# FocusGate Browser Extension (Chrome / Edge MV3)

Manifest V3 browser extension that syncs with `GET /api/agent/policy` and blocks websites listed in your FocusGate `blocked_domains` (or enforces `whitelist_focus_mode` using `allowed_domains`) whenever `lockActive` is `true`.

## Cài đặt nhanh trên Chrome hoặc Microsoft Edge

1. Mở `chrome://extensions` (hoặc `edge://extensions` trên Edge).
2. Bật **Developer mode** (Chế độ nhà phát triển).
3. Chọn **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục `apps/browser-extension`.
4. Nhấn vào biểu tượng **FocusGate Blocker** trên thanh công cụ, đăng nhập bằng tài khoản FocusGate Web của bạn để đồng bộ.
