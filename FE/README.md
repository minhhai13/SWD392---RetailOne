# RetailOne — Frontend Quản lý đơn mua hàng (UC22–UC26)

React 19 + Vite + React Router + Axios + React Bootstrap. Giao diện tiếng Việt, gọi **backend Express + SQL Server thật** (không mock dữ liệu).

| UC | Màn hình |
|---|---|
| Login | `/login` |
| UC23 | `/purchase-orders` — tìm kiếm, lọc trạng thái/ngày, sắp xếp, phân trang (đồng bộ URL) |
| UC24 | `/purchase-orders/:id` — chi tiết, snapshot NCC, dòng thời gian |
| UC22 | `/purchase-orders/new` — chọn NCC, catalog + giá, soạn dòng hàng, tạo đơn |
| UC25 / UC26 | Modal **Duyệt đơn** / **Hủy đơn** (có lý do) trong trang chi tiết |

## Chạy
```bash
# Backend (thư mục DoMinhHai_HE190261_UC22-UC26): npm start   -> http://localhost:5001
cd FE
cp .env.example .env       # VITE_API_BASE_URL=http://localhost:5001/api (khớp PORT của backend)
npm install
npm run dev                # in ra địa chỉ (thường http://localhost:5173)
```
`VITE_*` là biến công khai: không đặt mật khẩu/secret ở đây. Tài khoản demo và kịch bản demo: `../DoMinhHai_HE190261_UC22-UC26/docs/work/FE-04-DEMO-GUIDE.md`.

## Lệnh
| Lệnh | Mục đích |
|---|---|
| `npm run dev` / `npm run build` / `npm run preview` | chạy / build / xem bản build |
| `npm test` | 117 test Vitest + React Testing Library |
| `npm run lint` | oxlint |
| `npm run contract` | kiểm tra contract với backend thật (cần `CONTRACT_*_PASSWORD`) |

## Cấu trúc `src/`
`api/` (axios client, authApi, supplierApi, purchaseOrderApi) · `auth/` (AuthContext, ProtectedRoute) · `components/{layout,common,purchaseOrder}` · `pages/` · `hooks/` (useAsync có AbortController, useDebounce) · `utils/` (format, validators, permissions, errorMessages, poQuery, draftReducer, idempotency…) · `routes.jsx` · `styles/`.

## Quy tắc đã áp dụng
- Token trong `sessionStorage`, gắn `Authorization: Bearer`; `401` → về Login, `403` → thông báo (không logout).
- Phân quyền giao diện bằng `user.permissions[]` và `availableActions` của backend; backend vẫn là nơi thực thi bảo mật.
- UC22 chỉ gửi `supplierId`, `note`, `items[variantId, quantity, note]` (không giá/tổng/status/actor); `Idempotency-Key` giữ nguyên khi retry cùng nội dung; `COMMIT_OUTCOME_UNKNOWN` không tự retry; `meta.detailLoaded=false` coi là đã lưu.
- Không có UC21/UC31, không CRUD supplier/product.

Tài liệu: `docs/work/FE-01…FE-04` và `FE-OPEN-QUESTIONS.md` trong thư mục backend.
