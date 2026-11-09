# 01 — REQUIREMENTS TRACEABILITY (UC22–UC26)

Nguồn: SRS `RetailOne_Course_Project_Report.docx` (II.5.2.2, BR), schema `RetailOne_schema_mssql(4).sql`, Figure IV-33.
Viết tắt: **Ctl** = `controllers/purchaseOrder.controller.js`; **Svc** = `services/InventoryServices/purchaseOrder.service.js`; **PO repo** = `repositories/purchaseOrder.repository.js`; **Sup repo** = `supplier.repository.js`; **Var repo** = `productVariant.repository.js`; **Price repo** = `supplierProductPrice.repository.js`; **MW** = `middlewares/auth.middleware.js` + `permission.middleware.js` (`authorizePermission`, quyền đọc từ `RoleFeatures`).
Sau refactor: validation nằm ở `validators/`, mapping response ở `dtos/`, entity ở `models/` (không còn gộp trong `models/purchaseOrder.model.js`).
Test ID tham chiếu file trong `test/` (xem `04-TEST-REPORT.md` cho kết quả thật). Cột Status: `PASS` = test tương ứng đã chạy thật trên SQL Server và đạt (xem `04-TEST-REPORT.md`); `N/A` = không có API (xử lý ở client).

## Business Rules

| BR | Hành vi | Nơi thực thi | SQL | Test | Status |
|---|---|---|---|---|---|
| BR-02 | Cashier không truy cập chức năng Manager; Warehouse chỉ mua hàng/kho | MW `authorizePermission` (Features) trên mọi route PO/lookup | `Roles`, `Users`, `Staff` | A-04, A-05 | PASS |
| BR-41 | Low-stock → PO (22.1) | Cùng `POST /purchase-orders` (không UC21) | — | 22-01 | PASS |
| BR-42 | PO mặc định `PENDING`; chỉ Manager duyệt | Svc create; MW approve=Manager | `DF_PO_Status`, `CK_PO_Status` | 22-01, 25-02 | PASS |
| BR-43 | Không hủy PO `RECEIVED` | Svc cancel + PO repo guard | `status` | 26-04 | PASS |
| BR-45 | Tồn kho chỉ tăng ở UC31 | Không đụng `InventoryStocks/Batches` | — | 22-05, 25-07, 26-08 | PASS |
| BR-81 | Cost price > 0, lấy giá mới nhất | Svc `validateItems` + Price repo | `SupplierProductPrices.price`, `CK_SPP_Price`, `CK_POI_Cost` | 22-03, 22-12 | PASS |
| BR-84 | Snapshot supplier trên PO | PO repo insert từ Sup repo; detail đọc snapshot | `PurchaseOrders.supplier*` | 22-16, 24-03 | PASS |
| BR-86 | Chặn tạo PO với supplier Inactive | Svc `validateSupplier` | `Suppliers.status` | 22-09 | PASS |

## UC22 — Create Purchase Order (Manager, Warehouse Staff)

| Step / Flow | Expected behavior | Ctl → Svc → Repo | SQL table / constraint | Test | Status |
|---|---|---|---|---|---|
| PRE-1 | Token hợp lệ + role Manager/Warehouse + Staff hợp lệ | MW | `Users`,`Roles`,`Staff` (`CK_Users_Status`,`CK_Staff_Status`) | A-01..A-07 | PASS |
| PRE-2 / Step 2 | Liệt kê supplier `Active` | `supplier.controller` → `supplier.service.getActiveSuppliers` → Sup repo | `Suppliers.status` | 22-14 | PASS |
| Step 3–4 | Tải catalog + giá mới nhất của supplier | `getSupplierCatalog` → Sup repo | `ProductSuppliers`, `ProductVariants`, `Products`, `SupplierProductPrices` (`IX_SPP_SupplierVariant`) | 22-14 | PASS |
| Step 5 / E1 | Quantity nguyên dương, items không rỗng | Svc `validateItems` | `CK_POI_Quantity` | 22-06, 22-07 | PASS |
| Step 5 | Không trùng variant | Svc `validateItems` (+ DB backstop) | `UQ_POI_PoVariant` | 22-08, SQL-02 | PASS |
| Step 5 | Variant thuộc supplier (mapping `ACTIVE`), product `Selling`, có giá | Svc + Var/Price repo | `ProductSuppliers`, `Products.status`, `SupplierProductPrices` | 22-11, 22-12, 22-13 | PASS |
| E2 | Supplier không có sản phẩm hợp lệ → báo lỗi | Svc `validateSupplier` | như trên | 22-14 | PASS |
| Step 6 | Tổng = SUM(quantity × costPrice) do server tính | PO repo (SQL `SUM(total)`) | `PurchaseOrderItems.total` (computed), `totalAmount DECIMAL(18,2)` | 22-01, 22-17, SQL-03 | PASS |
| Step 8 / POST-1,2 | Một PO `PENDING`, `poCode` do SQL, snapshot supplier, `createdBy`=Staff.id từ token | Svc → PO repo `createPurchaseOrder` (1 transaction) | `PurchaseOrders` (`poCode` computed, `FK_PO_CreatedBy`) | 22-01, 22-02, 22-04, SQL-01 | PASS |
| POST-3 | Tồn kho không đổi | — | `InventoryStocks` | 22-05 | PASS |
| E3 | Lỗi DB → rollback toàn bộ, báo retry | `withTransaction` | transaction | 22-15 | PASS |
| 22.1 / 22.2 / 22.3 | Client-side; không DRAFT | (không có API) | — | — (ghi nhận Q11) | N/A |

## UC22.1 — Create Purchase Order from Low-Stock List (alternative flow, đã làm)

| Step | Expected behavior | Ctl → Svc → Repo | SQL | Test | Status |
|---|---|---|---|---|---|
| 22.1.1 | Nhận danh sách variant đã chọn (`variantIds`), validate | `supplier.controller.getSuppliersForVariants` → `supplier.validator.parseVariantIdList` | `ProductVariants`, `Products`, `InventoryStocks` (đọc) | 22.1-07, 22.1-06 | PASS |
| 22.1.2 | Lọc supplier **Active** cung cấp các variant (mapping `ACTIVE`, product `Selling`, giá mới nhất > 0) | `supplier.service.getSuppliersForVariants` → `supplier.repository.getSuppliersForVariants` | `Suppliers`, `ProductSuppliers`, `SupplierProductPrices` | 22.1-01, 22.1-02, 22.1-05 | PASS |
| 22.1.2 | Giá từ DB, không tin giá client | như trên | `SupplierProductPrices` (`createdAt DESC, id DESC`) | 22.1-03 | PASS |
| 22.1.2 | Không có supplier phù hợp → thông báo | controller (200 + message) | — | 22.1-04 | PASS |
| 22.1.3 | Chọn supplier, điền sẵn items → `POST /purchase-orders` (một supplier/PO) | `createPurchaseOrder` | như UC22 | 22.1-08 | PASS |
| — | API chỉ đọc | — | — | 22.1-09 | PASS |

## UC22 bổ sung (độ bền)

| Yêu cầu | Hành vi | Nơi thực thi | Test | Status |
|---|---|---|---|---|
| Lỗi đọc sau COMMIT không biến thành lỗi ghi | `loadAfterCommit` → 2xx + `meta.detailLoaded=false` | `purchaseOrder.service` | 22-21, 22-22 | PASS |
| COMMIT không xác nhận | `COMMIT_OUTCOME_UNKNOWN`, không để dữ liệu dở | `infrastructure/transaction.js` | 22-23 | PASS |
| Retry không tạo PO trùng | `Idempotency-Key` (in-memory) | `infrastructure/idempotency.js` | 22-24…22-27 | PASS (bền vững: Q17) |
| Header + items atomic dưới tải song song | 1 transaction, seek `UQ_POI_PoVariant` | `purchaseOrder.repository.recalculateTotal` | 22-26, 22-28 | PASS (Q20) |

## UC23 — View Purchase Orders (Manager, Warehouse Staff)

| Step / Flow | Expected behavior | Ctl → Svc → Repo | SQL | Test | Status |
|---|---|---|---|---|---|
| Step 2–3 | Danh sách mới nhất trước (`createdAt DESC, id DESC`), cột: id, poCode, createdAt, supplierName (snapshot), createdBy (tên), totalAmount, status | `getPurchaseOrders` → Svc → PO repo | `PurchaseOrders` ⨝ `Staff`; `IX_PO_StatusCreated` | 23-01 | PASS |
| 23.1 | Lọc `status` ∈ enum, khoảng ngày hợp lệ | Svc validate query | `CK_PO_Status` | 23-02, 23-03 | PASS |
| 23.2 | Tìm theo PO ID/code hoặc tên supplier (escape LIKE) | PO repo (parameterized) | `poCode`, `supplierName` | 23-04 | PASS |
| 23.3 | Sort whitelist: createdAt, supplierName, totalAmount, status | Svc whitelist → PO repo | — | 23-05 | PASS |
| Phân trang | `page`, `pageSize` (≤100) | PO repo `OFFSET/FETCH` | — | 23-06 | PASS |
| E1 | Không có kết quả → 200 + danh sách rỗng + message | Svc | — | 23-07 | PASS |
| E2 | Lỗi DB → log an toàn, 500 `DB_ERROR` | error middleware | — | 23-08 | PASS |
| POST-2 | Chỉ đọc | PO repo `SELECT` | — | 23-09 | PASS |

## UC24 — View Purchase Order Details (Manager, Warehouse Staff)

| Step / Flow | Expected behavior | Ctl → Svc → Repo | SQL | Test | Status |
|---|---|---|---|---|---|
| Step 2–3 | Header + snapshot supplier + items (variant, unit, product, costPrice snapshot, quantity, total) + totalAmount + creator/approver/canceler + cancelReason | `getPurchaseOrderDetail` → PO repo `getPurchaseOrderDetail` | `PurchaseOrders`, `PurchaseOrderItems`, `ProductVariants`, `Products`, `Staff` | 24-01, 24-03 | PASS |
| "status history" | `timeline` suy từ timestamps + `GoodReceipts.receivedAt` (không phải audit log) | PO repo (LEFT JOIN `GoodReceipts`, đọc) | `GoodReceipts` | 24-06 | PASS (Q3: timeline suy từ timestamp) |
| Step 4 | `availableActions` theo role+status | Svc | — | 24-05 | PASS |
| E1 | Không tìm thấy → 404 `PO_NOT_FOUND`; id sai → 400 | Svc/Ctl | — | 24-02 | PASS |
| POST-2 | Chỉ đọc | — | — | 24-04 | PASS |

## UC25 — Approve Purchase Order (Manager ONLY)

| Step / Flow | Expected behavior | Ctl → Svc → Repo | SQL | Test | Status |
|---|---|---|---|---|---|
| PRE-1 | Chỉ Manager | MW | `Roles.name` | 25-02, A-05 | PASS |
| Step 3 | Trong 1 transaction: khóa PO (`UPDLOCK,HOLDLOCK`), còn `PENDING`; supplier `Active`; products `Selling` | Svc → PO repo `getPurchaseOrderForUpdate`, `getApprovalBlockers` | `PurchaseOrders`, `Suppliers`, `Products` | 25-03, 25-04, 25-05 | PASS |
| Step 4 / POST-1,2 | `UPDATE … SET status='APPROVED', approvedBy=@staff, approvedAt=SYSDATETIME() WHERE id=@id AND status='PENDING'`; kiểm tra rowsAffected=1 | PO repo `updatePurchaseOrderStatus` | `CK_PO_ApprovalInfo`, `FK_PO_ApprovedBy` | 25-01, 25-06 | PASS |
| Race 2 Manager | Một thắng, một nhận 409 | transaction + state guard | — | 25-06 | PASS |
| E1 | Không còn PENDING → 409 `PO_INVALID_STATUS` | Svc | — | 25-03 | PASS |
| E2 | Supplier/Product inactive → 422 | Svc | — | 25-04, 25-05 | PASS |
| E3 | Lỗi DB → rollback, PO vẫn PENDING | `withTransaction` | — | 25-08 | PASS |
| POST-3 / Other | Không đổi tồn kho | — | `InventoryStocks` | 25-07 | PASS |
| 25.1 | Hủy xác nhận ở UI → không có request | — | — | — | N/A |

## UC26 — Cancel Purchase Order (Manager ONLY)

| Step / Flow | Expected behavior | Ctl → Svc → Repo | SQL | Test | Status |
|---|---|---|---|---|---|
| PRE-1 | Chỉ Manager | MW | — | A-05 | PASS |
| E2 | `reason` bắt buộc (trim, ≤ 500 ký tự) | Svc validate | `cancelReason NVARCHAR(500)`, `CK_PO_CancelInfo` | 26-03 | PASS |
| Step 4 / E1 | Trong 1 transaction: khóa PO; chỉ `PENDING`/`APPROVED`; **không có `GoodReceipts`** (đọc với `HOLDLOCK`) | Svc → PO repo `getPurchaseOrderForUpdate`, `hasGoodReceipt` | `GoodReceipts` (`UQ_GR_Po`) | 26-04, 26-05, 26-07 | PASS |
| Step 5 / POST-1,2,3 | `UPDATE … SET status='CANCELED', canceledBy, canceledAt=SYSDATETIME(), cancelReason WHERE id=@id AND status IN ('PENDING','APPROVED')`; rowsAffected=1; không xóa header/item | PO repo `updatePurchaseOrderStatus` | `FK_PO_CanceledBy`, `CK_PO_CancelInfo` | 26-01, 26-02, 26-08 | PASS |
| Locked sau hủy | Không approve/cancel lại | Svc | — | 26-09 | PASS |
| Race | cancel×cancel, cancel×approve, cancel×đang nhận hàng | transaction + locks | — | 26-06, 26-07 | PASS |
| E3 | Lỗi DB → rollback, giữ trạng thái cũ | `withTransaction` | — | 26-10 | PASS |

## RBAC (Features) / Model / Seed

| Yêu cầu | Test |
|---|---|
| Ma trận quyền Manager / Warehouse Staff / Cashier trên UC22–UC26 + lookups | RBAC-01, RBAC-02 |
| Quyền đọc từ `RoleFeatures` (đổi mapping → đổi quyền ngay), role alias không có quyền | RBAC-03, RBAC-04, RBAC-05 |
| Model khớp bảng thật (cột, kiểu, nullable, IDENTITY, computed, DEFAULT, PK) | MODEL-01 (14 bảng), M-01…M-05 |
| Validators / DTOs | V-01…V-07, D-01…D-03 |
| Layering, không circular, không SQL trong model, không Mongo | A-01…A-06 (unit) |
| Seed idempotent, dữ liệu hợp lệ, reset mật khẩu chỉ cho demo | SEED-01…SEED-04, I-04, I-05 |

## Auth / SQL tổng quát

| Yêu cầu | Test |
|---|---|
| Không token → 401; token sai/hết hạn → 401 | A-01, A-02, A-03 |
| Cashier → 403 ở mọi route PO; Warehouse → 403 approve/cancel | A-04, A-05 |
| User locked / staff resigned → bị chặn | A-07, A-08 |
| `createdBy/approvedBy/canceledBy` không lấy từ body | A-09 |
| IDENTITY, computed (`poCode`,`total`,`receivedTotal`), CHECK/UNIQUE/FK hoạt động thật | SQL-01, SQL-02, SQL-03 |
| Kết nối DB, schema có đủ bảng/cột cần dùng | DB-01 (`SCHEMA-VERIFY.md`) |
