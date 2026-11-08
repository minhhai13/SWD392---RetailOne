# FE-03 — TEST REPORT (Frontend)

Chạy ngày 2026-11-08. Chỉ ghi kết quả đã quan sát thực tế.

## Môi trường
- Node.js v25.5.0, npm 11.8.0, macOS (Apple Silicon); React 19, Vite 8, React Router 7, Axios, React Bootstrap 2, Vitest 4 + React Testing Library.
- Backend Express 5 + **SQL Server 2022 thật** (Docker, container thử nghiệm riêng, DB `RetailOnePOS_TEST` đã seed). Các kiểm tra full-stack **không chạy trên DB `RetailOnePOS` của người dùng**, để không làm đổi trạng thái các PO demo của họ.
- Không dùng mock data trong runtime; API chỉ được mock (`vi.spyOn`) trong test Vitest.

## Lệnh và kết quả
| Lệnh (trong `FE/`) | Kết quả |
|---|---|
| `npm test` (`vitest run`) | **117 test PASS / 0 FAIL / 0 SKIPPED** (5 file, ≈ 3 s) |
| `npm run lint` (oxlint) | 0 cảnh báo, 0 lỗi |
| `npm run build` | thành công (≈ 0.2 s) |
| `npm run contract` (backend thật, 3 tài khoản seed) | **33/33 kiểm tra PASS** |
| `npm run dev` + thao tác thật trên trình duyệt | chạy được; xem mục "Kiểm tra giao diện thật" |

### Vitest theo file
| File | Tests | Nội dung |
|---|---:|---|
| `tests/unit/utils.test.js` | 23 | format tiền/ngày (VND, múi giờ VN, null), validators (quantity, lý do hủy ≤500, khoảng ngày, draft, preview chính xác), payload UC22 (không có `costPrice/total/status/actor`), permissions, error mapper (code → tiếng Việt, không lộ lỗi SQL), phân loại lỗi approve/cancel, URL query, idempotency key, draft reducer, phân trang |
| `tests/auth/auth.test.jsx` | 21 | Login (required, Enter, toggle mật khẩu, lỗi 401/403/mạng, chống double submit), khôi phục phiên `/auth/me`, protected route + quay lại trang cũ, logout (không nhớ trang sau khi chủ động đăng xuất), retry khi backend không tới, RBAC UI (Manager/Warehouse/Cashier), Axios (Bearer, 401 → xóa phiên, 403 không logout, chuẩn hóa lỗi) |
| `tests/pages/poList.test.jsx` | 12 | UC23: cột & dữ liệu từ API, quyền nút Tạo, Empty/Error+Retry, filter/sort/page từ URL, đổi filter → page 1, search debounce, khoảng ngày sai không gọi API, sort header, phân trang, page size, xóa bộ lọc, race response cũ |
| `tests/pages/poCreate.test.jsx` | 35 | UC22: NCC + catalog + giá API, tìm trong catalog, thêm/xóa/sửa (22.2), preview tổng, body đúng chuẩn + Idempotency-Key, không trùng variant, đổi NCC có xác nhận, race catalog, empty items / quantity sai (0, -3, 1.5, abc, rỗng), NCC không có sản phẩm (E2), 422/409/403, lỗi mạng (không tự retry, retry cùng key, đổi payload → key mới), `COMMIT_OUTCOME_UNKNOWN` (chặn gửi lại đến khi xác nhận), replay 200, `meta.detailLoaded=false`, hủy/rời trang (22.3), `beforeunload` |
| `tests/pages/poDetail.test.jsx` | 26 | UC24: snapshot NCC, dòng hàng, tổng, timeline, availableActions ∩ permission, CANCELED/RECEIVED không có nút, 404, Retry, Back giữ filter; UC25: modal, double-click chỉ 1 request, reload sau duyệt, 409/403/422/DB/COMMIT unknown, `detailLoaded=false`, reload lỗi sau khi đã lưu; UC26: lý do bắt buộc/trim/≤500 + đếm ký tự, hủy PENDING/APPROVED, đóng modal không gọi API, GOODS_RECEIPT_EXISTS/PO_INVALID_STATUS/CONCURRENT_UPDATE/lỗi mạng |

### Contract check (backend thật) — `scripts/contract-check.mjs`
33/33 PASS: shape của login/me/suppliers/catalog/by-variants/list/detail; tạo PO (201, PENDING, giá & tổng do server tính); replay cùng `Idempotency-Key` (200, cùng PO, header `Idempotent-Replay: true`); duplicate/quantity/empty → 400; approve/cancel (403 cho Warehouse, 409 khi trạng thái sai, 400 lý do rỗng/dài); timeline `CREATED, APPROVED, CANCELED`; 404; Cashier 403. Script tự tạo **một** PO của riêng nó rồi duyệt/hủy đúng PO đó.

## Kiểm tra giao diện thật (trình duyệt + backend + SQL Server)
Thao tác trực tiếp trên `npm run dev` (Vite) với backend chạy thật:
- Đăng nhập Manager → danh sách PO từ SQL Server (6 đơn, màu trạng thái, cột đủ) → "Tạo đơn mua hàng" → chọn NCC → catalog + giá thật → thêm 2 sản phẩm → nhập số lượng sai (1.5: báo lỗi tại field) → sửa lại (10 và 50), tổng tạm tính 1.110.000 ₫ → tạo thành công **PO-000727 (Chờ duyệt)**, trang chi tiết đúng supplier snapshot, giá, tổng, timeline.
- UC25: "Duyệt đơn" → modal (mã đơn, NCC, tổng) → xác nhận → toast, trạng thái **Đã duyệt**, hiển thị người duyệt; log backend: `PATCH …/approve 200` rồi `GET …` tải lại.
- UC26: "Hủy đơn" → xác nhận khi chưa nhập lý do bị chặn tại field ("Vui lòng nhập lý do hủy đơn.", đếm 0/500) → nhập lý do (có khoảng trắng đầu/cuối) → toast, trạng thái **Đã hủy**, banner lý do (đã trim), các nút hành động biến mất.
- Warehouse Staff: xem chi tiết PO PENDING **không có** nút Duyệt/Hủy; tải lại trang vẫn giữ phiên (`/auth/me`).
- Mobile (375×812): không tràn ngang ở danh sách, chi tiết, tạo đơn; menu hamburger (off-canvas) hoạt động.
- Console của trình duyệt: không có lỗi nghiêm trọng (chỉ log Vite/React DevTools).

## Chưa kiểm tra / giới hạn
- **Cashier trên giao diện thật** chỉ được kiểm bằng test Vitest (Forbidden page) và contract (API 403); chưa thao tác tay trên trình duyệt.
- Các lỗi 409/422/COMMIT unknown/lỗi mạng chỉ kiểm bằng test có mock API (khó tái hiện trên backend thật); riêng 409 `PO_INVALID_STATUS`, 403, 400 đã được xác nhận ở mức API bằng contract check.
- Chưa có Playwright/Cypress E2E tự động; E2E là thao tác thủ công trên trình duyệt như mô tả ở trên.
- Chưa chạy giao diện với DB `RetailOnePOS` của người dùng (tránh làm đổi dữ liệu demo); cấu hình chỉ cần đổi `VITE_API_BASE_URL` và backend `.env` — xem `FE-04-DEMO-GUIDE.md`.
- Không kiểm thử trình duyệt ngoài Chromium của khung xem trước, không kiểm thử khả năng truy cập bằng trình đọc màn hình (đã dùng role/label ARIA, focus trap của modal).
- Mỗi lần chạy `contract-check` tạo thêm 1 PO (đã hủy) trong DB đích.
