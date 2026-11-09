# FE-01 — IMPLEMENTATION PLAN (Frontend UC22–UC26)

Tuân theo `CLAUDE.md` (Frontend). Stack: React 19 + Vite (JavaScript), React Router (data router), Axios, React Bootstrap + Bootstrap 5, Vitest + React Testing Library. Không Redux/Zustand, không TypeScript, không mock trong runtime.

**Vị trí:** `CLAUDE.md` gợi ý `frontend/` trong thư mục backend, nhưng người dùng đã yêu cầu thư mục `FE/` **cùng cấp** với backend (`/Users/minhhai1209/SWD392/FE`). Giữ `FE/` theo yêu cầu của người dùng; tài liệu `FE-*.md` nằm ở `docs/work/` của backend như CLAUDE.md quy định.

## Phase 0 — Audit (xong)
- Port backend thực tế: `PORT=5001` (`.env`, `.env.example`); cổng 5000 bị macOS AirPlay chiếm. `FE/.env.example`: `VITE_API_BASE_URL=http://localhost:5001/api`.
- Contract được xác minh từ source: `routes/inventory.route.js`, `controllers/*.js`, `validators/*.js`, `dtos/*.js`, `constants/*.js`, `middlewares/*.js`, `services/InventoryServices/*.js` và script `FE/scripts/contract-check.mjs` (chạy với backend thật).
- Kết nối SQL Server: backend chạy với SQL Server thật; kiểm thử full-stack chạy trên container thử nghiệm (không đụng DB demo của người dùng).
- Phát hiện: xem `FE-OPEN-QUESTIONS.md` (CORS không expose `Idempotent-Replay`; timezone).

## Route map
| Route | Trang | Quyền |
|---|---|---|
| `/login` | LoginPage | công khai (đã đăng nhập → chuyển về `/purchase-orders`) |
| `/` | redirect → `/purchase-orders` | — |
| `/purchase-orders` | PurchaseOrderListPage (UC23) | `VIEW_PURCHASE_ORDER` |
| `/purchase-orders/new` | CreatePurchaseOrderPage (UC22) | `CREATE_PURCHASE_ORDER` |
| `/purchase-orders/:id` | PurchaseOrderDetailPage (UC24) + modal UC25/UC26 | `VIEW_PURCHASE_ORDER` |
| `/403` (render tại chỗ) | ForbiddenPage | — |
| `*` | NotFoundPage | — |

Cashier (không có VIEW/CREATE) đăng nhập được nhưng mọi trang nghiệp vụ hiển thị ForbiddenPage (kèm nút đăng xuất); sidebar không có mục nào.

## Cấu trúc (`FE/src`)
```text
api/        axiosClient.js, authApi.js, supplierApi.js, purchaseOrderApi.js
auth/       AuthContext.jsx, useAuth.js, ProtectedRoute.jsx
components/ layout/{AppLayout,AppNavbar,Sidebar}  common/{LoadingState,EmptyState,ErrorState,StatusBadge,ConfirmModal,ToastProvider,PageHeader}
            purchaseOrder/{PoFilters,PoTable,PoPagination,SupplierSelect,CatalogPicker,DraftItemsTable,SupplierInfoCard,ItemsTable,Timeline,ApproveModal,CancelModal}
pages/      LoginPage, PurchaseOrderListPage, CreatePurchaseOrderPage, PurchaseOrderDetailPage, ForbiddenPage, NotFoundPage
hooks/      useAsync, useDebounce
utils/      format, validators, permissions, errorMessages, poQuery, status, tokenStorage, idempotency
styles/     app.css
tests/      unit/, auth/, pages/
```

## API mapping
| FE module | Endpoint |
|---|---|
| `authApi.login/me/logout` | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| `supplierApi.listSuppliers/getCatalog` | `GET /inventory/suppliers`, `GET /inventory/suppliers/:id/products` |
| `supplierApi.getSuppliersByVariants` | `GET /inventory/suppliers/by-variants?variantIds=` (UC22.1; chỉ cung cấp hàm, không có màn hình Stock Level) |
| `purchaseOrderApi.list/get/create/approve/cancel` | `GET/POST /inventory/purchase-orders`, `GET /:id`, `PATCH /:id/approve`, `PATCH /:id/cancel` |

## Quyết định thiết kế chính
- **Token**: `sessionStorage`; không lưu mật khẩu; `401` (trừ login) → xoá phiên + về Login có `from`; `403` → thông báo, không logout.
- **URL là nguồn sự thật của UC23**: `status, from, to, q, sortBy, sortDir, page, pageSize` nằm trong query string; đổi filter → `page=1`; ô tìm kiếm debounce 400 ms. Quay lại từ chi tiết giữ nguyên query (qua `location.state` + `sessionStorage` dự phòng).
- **UC22**: body chỉ gồm `supplierId`, `note?`, `items[{variantId, quantity, note?}]`. Giá/tổng chỉ để hiển thị preview. `Idempotency-Key` sinh khi gửi lần đầu, **giữ nguyên khi retry cùng payload**, đổi khi payload đổi; không tự retry. `COMMIT_OUTCOME_UNKNOWN` → chặn gửi lại đến khi người dùng xác nhận đã kiểm tra danh sách. `meta.detailLoaded=false` → coi là thành công, không gửi lại, chuyển sang trang chi tiết (tự GET). Replay nhận biết bằng HTTP `200` (xem FE-OPEN-QUESTIONS).
- **Hộp thoại rời trang** dùng `useBlocker` (data router) + `beforeunload` khi draft đã chỉnh.
- **UC25/UC26** là modal xác nhận; chặn double-submit bằng ref + disabled; sau mỗi action luôn `GET` lại chi tiết.
- **Race**: mọi GET dùng `AbortController` (hook `useAsync`); response cũ không ghi đè state mới.
- **Format**: `Intl.NumberFormat('vi-VN')` VND (tối đa 2 chữ số thập phân), ngày giờ `Asia/Ho_Chi_Minh`.

## Kế hoạch theo phase
1. Scaffold: cài `react-router-dom axios react-bootstrap bootstrap bootstrap-icons`, dev: `vitest @testing-library/* jsdom`; env, theme, shell, router.
2. Auth: axios client, AuthContext, Login, ProtectedRoute, permission helpers, 401/403.
3. UC23 + UC24.
4. UC22.
5. UC25 + UC26.
6. Test (Vitest), build, kiểm tra UI thật trên trình duyệt với backend + SQL Server thật, README, Demo Guide, Test Report.
