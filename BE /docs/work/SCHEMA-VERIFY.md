# SCHEMA-VERIFY — bảng/cột/constraint UC22–UC26 thực sự dùng

Nguồn: `docs/reference/RetailOne_schema_mssql(4).sql` (không bị sửa). Kiểm tra tự động bằng test `DB-01` (`test/integration/foundation.test.js`) trên DB `RetailOnePOS_TEST` được tạo từ chính file này (42 bảng).

## Tạo DB test an toàn
```bash
docker run -d --name retailone_sql_test -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=<mật-khẩu-mạnh>' -p 14331:1433 mcr.microsoft.com/mssql/server:2022-latest
cp .env.example .env     # điền DB_PORT=14331, DB_USER=sa, DB_PASSWORD=<mật-khẩu-mạnh>, DB_NAME=RetailOnePOS_TEST, JWT_SECRET=...
npm run db:setup-test
```
`scripts/setup-test-db.js`: (1) bắt buộc `DB_NAME` kết thúc bằng `_TEST`; (2) **không chạy** các batch `USE/DROP DATABASE/CREATE DATABASE` của file schema; (3) chỉ `CREATE DATABASE` khi chưa tồn tại; (4) từ chối nếu DB đã có bảng. Không có lệnh `DROP` nào được thực thi.

## Bảng và cách dùng

| Bảng | Cột dùng | Đọc/Ghi | Constraint liên quan |
|---|---|---|---|
| `Roles` | id, name | R | `UQ_Roles_Name` |
| `Users` | id, roleId, username, passwordHash, isActive, requirePasswordChange | R | `UQ_Users_Username`, `CK_Users_Status` (`active`/`locked`) |
| `Staff` | id (BIGINT), userId, fullName, employmentStatus | R | `UQ_Staff_User`, `CK_Staff_Status` (`working`/`resigned`) |
| `Suppliers` | id, name, taxId, phoneNumber, address, status | R | `CK_Supplier_Status` (`Active`/`Inactive`) |
| `Products` | id (BIGINT), code, name, baseUnit, status | R | `CK_Product_Status` (`Selling`/`StopSelling`/`Suspended`) |
| `ProductVariants` | id, productId, unitName, conversionFactor, barcode, unitType | R | `FK_Variant_Product` |
| `ProductSuppliers` | productId, supplierId, status | R | `CK_PS_Status` (`ACTIVE`/`INACTIVE`) |
| `SupplierProductPrices` | id, supplierId, variantId, price, createdAt | R | `CK_SPP_Price` (> 0), `IX_SPP_SupplierVariant` |
| **`PurchaseOrders`** | id (IDENTITY), poCode (computed), supplierId, supplier* (snapshot), status, totalAmount, note, createdBy, createdAt, approvedBy/At, canceledBy/At, cancelReason | **R/W** | `CK_PO_Status`, `CK_PO_Total`, `CK_PO_ApprovalInfo`, `CK_PO_CancelInfo`, `FK_PO_*`, `DF_PO_Status` |
| **`PurchaseOrderItems`** | id (IDENTITY), poId, variantId, quantity, costPrice, note, receivedQuantity, `receivedTotal`/`total` (computed) | **R/W** | `UQ_POI_PoVariant`, `CK_POI_Quantity`, `CK_POI_Cost`, `FK_POI_PO` (cascade), `FK_POI_Variant` |
| `GoodReceipts` | id, poId, receivedAt, receivedBy | **R only** (UC26 guard + UC24 timeline) | `UQ_GR_Po` |
| `InventoryStocks`, `Batches` | — | **không đụng** (chỉ test đọc để chứng minh tồn kho không đổi) | — |

## Quy tắc code ↔ schema
- Không bao giờ INSERT/UPDATE `poCode`, `total`, `receivedTotal` (test SQL-01 chứng minh SQL Server từ chối).
- `PurchaseOrders.status` luôn UPPERCASE `PENDING|APPROVED|RECEIVED|CANCELED`.
- `createdBy/approvedBy/canceledBy` = `Staff.id` (BIGINT) lấy từ token → DB, không phải `Users.id`.
- Số tiền/lượng dùng `DECIMAL` ở tầng SQL (`Decimal(15,3)`, `Decimal(15,2)`); tổng PO = `SUM(total)` do SQL tính.
- Mọi giá trị đi vào SQL là tham số (`request.input`); chỉ có tên cột sắp xếp lấy từ whitelist cố định trong `constants/purchaseOrder.js`.

## Đã so sánh với CLAUDE.md
- `UQ_GRI_POItem UNIQUE([poItemId])` **có** trong file (dòng 510) — đã xác minh lại bằng `grep`, ghi chú cũ trong CLAUDE.md/README đã được sửa. Xem `OPEN-QUESTIONS.md` Q1.
- File schema không có bảng lịch sử trạng thái PO — xem Q3.
- File schema không có dữ liệu seed (`Roles/Features/RoleFeatures`) — xem Q4/Q16.

## Cập nhật refactor cuối
- **Model ↔ schema:** `src/models/*.model.js` (14 bảng: Roles, Features, RoleFeatures, Users, Staff, Suppliers, Products, ProductVariants, ProductSuppliers, SupplierProductPrices, PurchaseOrders, PurchaseOrderItems, GoodReceipts, InventoryStocks) được test `MODEL-01` đối chiếu với `sys.columns`/`sys.indexes`: tên cột, kiểu (`varchar/nvarchar` độ dài, `decimal` precision/scale, `datetime2` scale), nullable, IDENTITY, computed, DEFAULT, primary key — **14/14 khớp**. `poCode`, `total`, `receivedTotal`, `receiptCode` là computed/read-only trong model.
- **RBAC:** dùng `Roles`, `Features`, `RoleFeatures` (4 feature key). Seed: `scripts/lib/rbac.js`.
- **Index hint:** `recalculateTotal` dùng `WITH (INDEX (UQ_POI_PoVariant))` (tên constraint lấy từ schema) để tránh deadlock khi tạo PO song song (Q20).
- **Seed demo:** chỉ INSERT (không UPDATE/DELETE dữ liệu có sẵn) vào các bảng trên; tra cứu theo khóa tự nhiên (`Roles.name`, `Features.featureKey`, `Users.username`, `Suppliers.taxId`, `Products.code`, ...). Không ghi vào cột IDENTITY/computed.
- Test chỉ ghi trực tiếp (ngoài API) vào `GoodReceipts` để mô phỏng kết quả UC31 và vào `RoleFeatures` (có khôi phục) — luôn trên DB `*_TEST`.
