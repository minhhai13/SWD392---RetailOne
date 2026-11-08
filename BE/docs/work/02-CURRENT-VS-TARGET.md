# 02 — CURRENT (legacy Mongo) vs TARGET (SQL Server, UC22–UC26)

Legend: **Giữ** = giữ file/ý tưởng; **Đổi** = viết lại cho SQL Server/SRS; **Loại** = xóa khỏi `src/` (tham khảo còn trong `docs/legacy/` và tài liệu này).

## 1. Hạ tầng

| Tệp / chức năng cũ | Quyết định | Lý do | Rủi ro |
|---|---|---|---|
| `src/index.js` (Mongo + Socket.IO + `/uploads`) | Đổi | Chỉ cần Express + SQL pool + routes; export `app`, `start`, `stop` cho test | Server không còn socket/upload (không UC nào cần) |
| `src/config/database.js` (`mongoose.connect`) | Đổi | `mssql` ConnectionPool, `connectDB/getPool/ping/closeDB`, lỗi không lộ secret | Sai env → server không khởi động (có thông báo an toàn) |
| `src/infrastructure/transaction.js` (Mongo session) | Đổi | `withTransaction(fn)` dùng `sql.Transaction`, repo nhận `executor` để cùng transaction; `SET LOCK_TIMEOUT` | Quên truyền executor → ghi ngoài transaction (có test rollback) |
| `src/config/{script.sql,pos.config.js,demo-seed.js}`, `src/utils/*`, `src/models/*` (Mongoose, sequence, schema.js), `src/repositories/helpers.js` | Loại | Mongo-specific / ngoài scope | — |
| `package.json` (mongoose, mongodb-memory-server, socket.io, multer, qrcode, sepay…) | Đổi | Thêm `mssql`; bỏ phụ thuộc không dùng; scripts mới `start/dev/test/test:unit/test:integration/db:setup-test/db:seed-dev` | Cần `npm install` |
| Scripts `seed/seed-demo/migrate:json/check` | Loại | Seed Mongo, không chạy lên DB mới | — |

## 2. Auth / phân quyền

| Cũ | Quyết định | Lý do | Rủi ro |
|---|---|---|---|
| `middlewares/permission.middleware.js` `authorize()` luôn `next()` | Đổi | Thay bằng `authorizeRoles(...)` thực sự (401/403) theo tên role từ DB | Tên role seed thật khác → 403 (xem OPEN-QUESTIONS Q4) |
| `auth.middleware.js` (Mongo user/role/staff lookup) | Đổi | JWT verify + 1 truy vấn SQL (Users ⨝ Roles ⨝ Staff) mỗi request; chặn locked/resigned; `req.user = {userId, staffId, role}` | Thêm 1 query/request (chấp nhận) |
| `protect.middleware.js`, `helperPermission.middleware.js`, `upload.middleware.js`, `constants/permissions.js`, `constants/loyalty.js` | Loại | Permission-key cũ, ngoài scope | — |
| `auth.service.js`, `auth.controller.js`, `auth.route.js` | Giữ ý tưởng, Đổi code | Login JWT; bcryptjs; lỗi chung "Invalid username or password"; thêm `GET /auth/me` | Đổi thông điệp lỗi so với bản cũ |
| `user/staff/role.repository.js` | Đổi / Loại role | `user.repository` (login + auth identity), `staff.repository` (theo `Staff.id` BIGINT); role đọc bằng JOIN | `Users.id` INT ≠ `Staff.id` BIGINT: audit chỉ dùng `staffId` |

## 3. Procurement (PO)

| Cũ | Target | Quyết định |
|---|---|---|
| `controllers/purchaseOrder.controller.js` | `createPurchaseOrder`, `getPurchaseOrders`, `getPurchaseOrderDetail`, `approvePurchaseOrder`, `cancelPurchaseOrder` (đúng Figure IV-33) | Đổi (viết mới) |
| `services/InventoryServices/purchaseOrder.service.js` (nhiều supplier → nhiều PO, Draft/Approved…, `receiveOrder`, tồn kho) | Một supplier → một PO `PENDING`; `validateSupplier`, `validateItems`, `calculateTotal`; approve/cancel với state guard | Đổi; **Loại** `receiveOrder`, cập nhật tồn kho |
| `repositories/purchaseOrder.repository.js` | SQL parameterized: `createPurchaseOrder`, `getPurchaseOrders`, `getPurchaseOrderDetail`, `getPurchaseOrderById`, `updatePurchaseOrderStatus` (approve/cancel) | Đổi |
| `repositories/supplier.repository.js` (+ `supplier.service/controller`) | `getSupplierById`, `getActiveSuppliers`, `getSupplierCatalog` (chỉ đọc) | Đổi; Loại CRUD supplier |
| `repositories/product/*`, `productUnit*` | `productVariant.repository` (`getVariantsByIds`), `supplierProductPrice.repository` (`getLatestPrices`) — dùng `variantId` thay `productUnitId` | Đổi |
| Models Mongoose PO/POItem/Supplier/… | `models/purchaseOrder.model.js` = hằng số trạng thái + validation/DTO thuần JS | Đổi |
| `poReport*`, `problematic*`, `adjust*`, `inventory.controller` (tồn kho, low-stock), mọi route khác (invoice, customer, promotion, voucher, shift, salary, return, payment, dashboard, upload, sse…) | — | Loại khỏi `src/` |

## 4. Bảng ánh xạ route (cũ → target)

Prefix `/api` giữ nguyên; response `{success, data, message}` giữ nguyên (lỗi thêm `code`).

| UC | Route cũ | Route target | Quyền |
|---|---|---|---|
| Login | `POST /api/auth/login` | giữ | public |
| — | `POST /api/auth/logout` | giữ (no-op, JWT stateless) | token |
| — | — | `GET /api/auth/me` | token |
| UC22 | `POST /api/inventory/purchase-orders/request` | `POST /api/inventory/purchase-orders` | Manager, Warehouse |
| UC23 | `GET /api/inventory/purchase-orders/list` | `GET /api/inventory/purchase-orders` | Manager, Warehouse |
| UC24 | `GET /api/inventory/purchase-orders/detail/:id` | `GET /api/inventory/purchase-orders/:id` | Manager, Warehouse |
| UC25 | `PATCH /api/inventory/purchase-orders/status/:id` | `PATCH /api/inventory/purchase-orders/:id/approve` | Manager |
| UC26 | `PATCH /api/inventory/purchase-orders/status/:id` | `PATCH /api/inventory/purchase-orders/:id/cancel` (body `{reason}`) | Manager |
| UC31 | `PATCH /api/inventory/purchase-orders/receive/:id` | **Loại** | — |
| Lookup UC22 | `GET /api/inventory/suppliers/list`, `/suppliers/:id/products` | `GET /api/inventory/suppliers` (Active), `GET /api/inventory/suppliers/:id/products` (catalog + giá mới nhất) | Manager, Warehouse |
| Cũ khác | `/suppliers/:id` (detail/CRUD), `/products/low-stock`, `/reports/*`, `/purchase-orders/report`, `/product-units/*`, … | **Loại** | — |

## 5. Sai khác nghiệp vụ code cũ cần sửa → cách sửa

| Code cũ | Target |
|---|---|
| Nhiều `supplierId`/request → nhiều PO | Đúng 1 `supplierId` → 1 PO |
| Status `Draft/Approved/Rejected/WaitingForDelivery/PartiallyReceived/CannotDeliver` | `PENDING/APPROVED/RECEIVED/CANCELED` |
| `receiveOrder()` | Loại (UC31) |
| `productUnitId`, giá từ mapping unit | `variantId`; giá = `SupplierProductPrices` mới nhất theo `(supplierId, variantId)` + mapping `ProductSuppliers` |
| `managerId`/staff từ client | `Staff.id` lấy từ token → DB |
| `authorize()` bypass | Kiểm tra role thật |

## 6. Refactor giai đoạn cuối (2026-11-08)

| Trước refactor | Sau refactor | Lý do / Rủi ro |
|---|---|---|
| `models/purchaseOrder.model.js` gộp hằng số + validation + DTO | `models/` 1 file/entity (`base.model.js`, `index.js`, 14 entity); validation → `validators/`; mapping → `dtos/`; hằng số → `constants/` | Theo mẫu `models.zip` (chỉ lấy phần định nghĩa `table/key/fields`, **bỏ** adapter CRUD để không trùng Repository). Test MODEL-01 đối chiếu từng model với bảng thật |
| `constants/roles.js` (role key `MANAGER/WAREHOUSE/OTHER`, alias `Warehouse`) và `authorizeRoles` | `constants/roles.js` (3 tên role chính xác) + `constants/permissions.js` + `authorizePermission(featureKey)`; `role.repository` đọc `RoleFeatures` | RBAC bằng `Features/RoleFeatures` như yêu cầu. Response login/me: `role.key` → `permissions[]` (frontend đổi theo) |
| `req.user.roleKey` | `req.user.permissions[]` (+ `roleId`, `roleName`) | availableActions và service dùng permission key |
| Service đọc lại PO ngay trong luồng và lỗi đọc → 500 | `loadAfterCommit`: lỗi đọc sau COMMIT → 2xx + `meta.detailLoaded=false` | Không báo nhầm ghi thất bại |
| `withTransaction` commit và trả về | Phân biệt lỗi trước/sau COMMIT; COMMIT lỗi → `COMMIT_OUTCOME_UNKNOWN` | Q19 |
| — | `infrastructure/idempotency.js` + header `Idempotency-Key` cho UC22 | Q17 |
| — | `GET /api/inventory/suppliers/by-variants` (UC22.1) | Q18 |
| `recalculateTotal` dễ deadlock khi tạo PO song song | Hint `INDEX (UQ_POI_PoVariant)` | Q20 |
| `scripts/seed-dev.js` tối giản | `scripts/lib/{rbac,fixtures,demoSeed}.js`, `seed-dev.js`, `reset-demo-passwords.js` | Idempotent, có PO PENDING/APPROVED/CANCELED, reset mật khẩu chỉ cho tài khoản demo |
| Route / HTTP contract UC22–UC26 | **Giữ nguyên** (thêm: `by-variants`, header `Idempotency-Key`, `meta`, `permissions`) | Frontend ổn định |

Route mới bổ sung: `GET /api/inventory/suppliers/by-variants?variantIds=…` — quyền `CREATE_PURCHASE_ORDER`.
