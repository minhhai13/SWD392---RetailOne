# CLAUDE.md — RetailOne POS | DoMinhHai_HE190261_UC22-UC26

> **Hướng dẫn bắt buộc cho Claude làm việc trực tiếp trong repository này.**
> **Nhiệm vụ:** tái sử dụng cấu trúc backend Node.js/Express hiện có, thay persistence MongoDB/Mongoose bằng **Microsoft SQL Server** cho những gì cần để triển khai **chính xác UC22–UC26**. KHÔNG chuyển, hoàn thiện hoặc viết lại toàn bộ RetailOne. KHÔNG làm frontend.
> **Trạng thái hiện tại (cập nhật 2026-11-08):** backend đã được chuyển sang Express 5 + SQL Server (`mssql`) và đã triển khai UC22–UC26 (+ UC22.1), RBAC theo `Features/RoleFeatures`, seed demo và bộ test (xem `README.md`, `docs/work/04-TEST-REPORT.md`). Các mô tả về "code cũ/Mongo" bên dưới là bối cảnh lịch sử; code Mongo đã bị loại khỏi `src/`. Đọc toàn bộ hướng dẫn trước khi sửa code.

## 0. Mục tiêu, phạm vi và những điều KHÔNG làm

### Kết quả bắt buộc

- Một backend nhỏ, chạy được, sử dụng **Node.js + Express + Microsoft SQL Server**, có kiến trúc **Routes → Controllers → Services → Repositories → [Models/DTOs] → SQL Server** tương đương bản cũ.
- Đúng **5 use cases** trong SRS: **UC22 Create Purchase Order; UC23 View Purchase Orders; UC24 View Purchase Order Details; UC25 Approve Purchase Order; UC26 Cancel Purchase Order**.
- Chỉ mang theo cơ sở hạ tầng thật sự cần thiết cho 5 UC: kết nối DB, cấu hình, authentication/JWT, authorization/RBAC, truy vấn Staff/Supplier/Product/ProductVariant/SupplierProductPrice/ProductSupplier và lớp xử lý PO. Các API tra cứu tối thiểu hỗ trợ tạo PO và kiểm thử có thể giữ/bổ sung nếu cần, nhưng **không biến thành CRUD các module khác**.
- Các endpoint có thể kiểm thử độc lập bằng Postman/curl hoặc automated integration tests, vì **backend ZIP không chứa frontend**. Không sinh React/Vite hoặc UI để thử API.
- Sửa code **trong dự án mới này**, không ghi đè mã nguồn gốc ở vị trí khác.

### Bất biến về phạm vi

- **KHÔNG** triển khai UC21 hoặc UC27–UC90, đặc biệt không viết UC31 Confirm Goods Receipt, UC32 report, quản lý tồn kho, bán hàng, ca làm, khuyến mãi, v.v.
- UC26 cần **kiểm tra đọc** bảng `GoodReceipts` để chống hủy PO đã nhận hàng; đó là dependency hợp lệ, **không phải triển khai UC31**.
- **KHÔNG** chuyển 42 bảng thành 42 model/repository/service. Database SQL Server đã được thiết kế trong tài liệu; chỉ cần những bảng và FK tối thiểu để 5 UC hoạt động và kiểm thử.
- **KHÔNG** chạy MongoDB và SQL Server đồng thời ở phiên bản cuối. Không giữ active imports `mongoose`, `mongodb-memory-server`, transaction/session Mongo trong đường chạy chính.
- **KHÔNG** tự sửa SRS, thay đổi nghiệp vụ, drop database, thêm bảng, bỏ FK/CHECK/UNIQUE/DEFAULT hoặc đổi SQL data types để 'code chạy được'. Nếu có mâu thuẫn, ghi vào tài liệu và hỏi người dùng đối với quyết định thay đổi schema/biz rules.
- **KHÔNG** tự đổi stack sang Spring Boot, TypeScript, NestJS, Prisma, Sequelize hoặc viết lại kiến trúc; ưu tiên giữ **CommonJS JavaScript + Express** và dùng `mssql` (node-mssql) kết nối SQL Server, trừ khi codebase có lý do đã kiểm chứng để chọn cách khác.
- **KHÔNG** commit secrets hoặc đưa nội dung `.env`, password, JWT secret, DB connection string thực vào câu trả lời/log.

## 1. Tài liệu Claude PHẢI đọc và thứ tự ưu tiên

Các tài liệu có sẵn trong `docs/reference/`:

1. **`RetailOne_Course_Project_Report.docx`** — tài liệu SRS + các phần Design Specification; trọng tâm là **II.5.2.2 Use case specifications UC-22 đến UC-26**, **Business Rules BR-02, BR-41, BR-42, BR-43, BR-45, BR-81, BR-84, BR-86**; kiểm tra thêm các quy tắc liên quan (nếu áp dụng). Đọc **normal, alternative, exception flows**, preconditions, postconditions và actor/permission. Đọc sơ đồ Sequence/Communication liên quan để tham khảo thứ tự tương tác; chúng KHÔNG được quyền thay đổi yêu cầu nghiệp vụ.
2. **`RetailOne_schema_mssql(4).sql`** — schema SQL Server **thực tế đang được cung cấp**: tên bảng/cột, kiểu dữ liệu, nullable, IDENTITY, computed, PK/FK, UNIQUE, CHECK, DEFAULT và cascade. Không suy luận schema từ tên Mongoose model cũ. Ghi rõ bất kỳ constraint nào người dùng đã trao đổi nhưng **chưa có trong tệp này**.
3. **`Implementation_Class_Diagrams_IV33-IV38.docx`** — ưu tiên **Figure IV-33 Purchase Order Management** và bảng mô tả ngay dưới hình; các class trùng tên trong IV-34–IV-38 giúp đối chiếu, nhưng 5 UC này không yêu cầu triển khai các hình còn lại.
4. **`UC22-UC26_SRS_EXTRACT.md`** — bản trích hỗ trợ đọc nhanh các UC và BR; nếu lệch so với báo cáo gốc, báo cáo gốc được ưu tiên.
5. **Source code đang có** trong `src/`, `package.json`, `docs/legacy/` — chỉ là **nguồn tham khảo để tái sử dụng**, KHÔNG phải nguồn chuẩn về trạng thái PO, API behavior hay DB.

### Thứ tự ưu tiên khi xung đột

**Use-case & business rules trong SRS → ràng buộc vật lý hiện có trong SQL script → Figure IV-33 & bảng mô tả → code backend cũ.** Đây là cách đánh giá yêu cầu, **không có nghĩa được tự sửa DB** khi SRS và SQL không khớp. Nếu hai nguồn cấp cao mâu thuẫn, tạo mục **Open Questions / Inconsistencies**, chỉ rõ câu/constraint và hướng giải quyết ít thay đổi nhất; đối với quyết định liên quan schema/rule phải chờ người dùng chấp thuận.

### Bước đọc bắt buộc, TRƯỚC khi viết code

1. Mở toàn bộ ba nguồn chính (SRS, SQL, UML). DOCX có hình: **phải kiểm tra hình/ảnh**, không dựa riêng vào văn bản tách khỏi DOCX nếu cần kiểm tra đường nối.
2. Đọc chính xác UC22–UC26 và BR trong tài liệu, không đọc qua rồi suy đoán.
3. Từ SQL, trích các bảng thực sự dùng và toàn bộ cột/constraints liên quan. Đặc biệt: `Roles`, `Features`, `RoleFeatures`, `Users`, `Staff`, `Suppliers`, `Products`, `ProductVariants`, `ProductSuppliers`, `SupplierProductPrices`, `PurchaseOrders`, `PurchaseOrderItems` và **`GoodReceipts` chỉ để kiểm tra trước khi hủy**. Các bảng phụ thuộc FK như `Categories` chỉ cần hỗ trợ dữ liệu test, không cần viết module CRUD.
4. Đọc các file core và PO trong backend, truy vết import/call graph, tìm **các dependency MongoDB còn chạy**.
5. Tạo `docs/work/01-REQUIREMENTS-TRACEABILITY.md` theo bảng: `UC & step/BR → Expected behavior → Controller → Service → Repository → SQL table/constraint → Test case → Status`.
6. Tạo `docs/work/02-CURRENT-VS-TARGET.md`: `Tệp cũ / chức năng cũ → Giữ / Đổi / Loại khỏi runtime → Lý do → Rủi ro`. Kể rõ route cũ so với route target.
7. Tạo `docs/work/03-IMPLEMENTATION-PLAN.md`, chia SQLServer migration và 5 UC thành các bước nhỏ. **Trình bày kế hoạch ngắn gọn cho người dùng trước khi sửa lớn**. Có thể tiến hành các thay đổi đúng phạm vi đã giao; nhưng nếu cần phá schema, xóa DB hoặc tự chọn luật còn mơ hồ, phải hỏi.
8. Đọc thêm nghiệp vụ khác **chỉ khi một phụ thuộc thực sự cần cho UC22–UC26**; ghi lý do. Không mở rộng scope vì thấy module cũ đang tồn tại.

## 2. Đánh giá đã xác nhận về backend cũ — bắt buộc chú ý

Backend ZIP cũ là **Express 5 + CommonJS + Mongoose 8 + JWT**, không có frontend. Có các thư mục `src/routes`, `src/controllers`, `src/services`, `src/repositories`, `src/models`, `src/config`, `src/middlewares`, `src/infrastructure`. Giữ cách chia này.

Các file cần rà trước:

- `src/index.js`: đang khởi tạo MongoDB (`MONGODB_URI`) và Socket.IO; ứng dụng mới chỉ cần Express/SQL Server + auth + PO, có thể bỏ Socket.IO khỏi đường chạy vì 5 UC không cần.
- `src/config/database.js`: dùng `mongoose.connect()` và Mongo replica set. **Thay hoàn toàn** bằng SQL Server pool, timeouts, login/test ping/close theo `mssql`.
- `src/infrastructure/transaction.js`: dùng Mongo session/`withTransaction`. Thay bằng SQL Server transaction và đảm bảo repository tham gia **cùng transaction**.
- `src/routes/index.route.js`, `src/routes/inventory.route.js`: mount nhiều routes ngoài scope, bao gồm `receiveOrder` (UC31); **chỉ kích hoạt routes cần thiết**. Giữ quy ước đường dẫn cũ khi hợp lý; nếu đổi, tạo bảng mapping cũ→mới và cập nhật tests.
- `src/controllers/purchaseOrder.controller.js`, `src/services/InventoryServices/purchaseOrder.service.js`, `src/repositories/purchaseOrder.repository.js`: có PO logic nhưng cần viết lại theo SRS và SQL hiện hành, **không sao chép logic cũ nguyên xi**.
- `src/models/purchaseOrder.model.js`, `purchaseOrderItem.model.js` và các models liên quan: Mongoose model cũ chỉ giúp hiểu cấu trúc. SQL mới dùng `ProductVariants.variantId` thay cho liên kết cũ `productUnitId` trong PO items.
- `src/middlewares/auth.middleware.js`, `src/middlewares/helperPermission.middleware.js`, `src/middlewares/permission.middleware.js`: cần audit. **`permission.middleware.js` cũ có `authorize()` cho đi qua mà không thực thi kiểm tra phân quyền (logic bị comment)**. Phải triển khai phân quyền thực sự cho cả 5 UC; không giả lập mọi request là Manager.
- `src/services/auth.service.js`, `src/repositories/user.repository.js`, `staff.repository.js`, `role.repository.js`: giữ ý tưởng JWT login, nhưng chuyển đọc quyền và user/staff sang SQL. `Users.id` **INT**, còn `Staff.id` **BIGINT**; đừng đánh đồng `req.user.id` (User) với staffId để ghi audit.
- `src/models/schema.js`, `src/models/sequence.model.js`, `src/repositories/helpers.js`: chứa Mongo-specific query, `Decimal128`, và tự tăng ID bằng sequence Mongo; **không tái sử dụng cho SQL**.
- `package.json`: chứa `mongoose`, `mongodb-memory-server`, các scripts demo/seed Mongo; cập nhật dependencies và scripts khi đã chuyển. **Không chạy seed cũ lên DB mới**.
- `src/config/script.sql`: bản cũ đi kèm code, **không phải schema chuẩn**; chỉ dùng `docs/reference/RetailOne_schema_mssql(4).sql`.

Các sai khác nghiệp vụ đang có trong code cũ phải sửa:

- Code cũ cho nhiều `supplierId` trong một request rồi tự sinh **nhiều PO**; target UC22 tạo **một PO cho một supplier**.
- Code cũ dùng `Draft`, `Approved`, `Rejected`, `WaitingForDelivery`, `PartiallyReceived`, `CannotDeliver`; SQL mới chỉ dùng `PENDING`, `APPROVED`, `RECEIVED`, `CANCELED` (UPPERCASE).
- Code cũ có `receiveOrder()`; **loại khỏi routes public của bài 5 UC**, không thay thế nó bằng UC31.
- Code cũ có thể lấy giá từ mapping unit cũ; SQL mới phân biệt `ProductSuppliers(productId,supplierId)` và lịch sử `SupplierProductPrices(supplierId,variantId,price,createdAt)`; cần xác thực cả liên kết product-supplier lẫn giá variant mới nhất.
- Chỉ lưu dữ liệu người tạo/duyệt/hủy bằng **Staff.id** lấy từ identity đã xác thực, không lấy managerId do client gửi.

## 3. SQL Server: thực thi đúng schema hiện hữu, không phá dữ liệu

- Sử dụng driver `mssql` (node-mssql) và **parameterized queries** cho tất cả giá trị; không nối ID, status hoặc search text vào câu SQL. Các cột tên SQL phải lấy từ script; không lấy tên field `productUnitId` của code cũ làm cột mới.
- Kết nối qua env vars trong `.env` (không commit), ví dụ `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`. Không ghi password trong docs/code.
- **CẢNH BÁO:** `RetailOne_schema_mssql(4).sql` bắt đầu bằng `ALTER DATABASE ... SET SINGLE_USER` và `DROP DATABASE [RetailOnePOS]`. **TUYỆT ĐỐI không chạy toàn bộ script vào database đang có dữ liệu nếu chưa được người dùng cho phép rõ ràng.** Chỉ tạo DB test mới/isolated khi có chỉ định; không coi reset DB là setup mặc định.
- Giữ SQL schema là nguồn chuẩn. Không tự chạy `synchronize`, `force`, `drop`, `ALTER` tùy tiện. Nên viết `docs/work/SCHEMA-VERIFY.md` liệt kê bảng/cột/constraints cần thiết và kiểm tra kết nối database test.
- `PurchaseOrders.id` là **INT IDENTITY**; `poCode` là **computed persisted** (từ `id`), không tự chèn/gán chuỗi từ JavaScript. Dùng `OUTPUT INSERTED.id, INSERTED.poCode` đúng khả năng driver.
- `PurchaseOrderItems.id` cũng `INT IDENTITY`; `receivedTotal` và `total` là computed persisted. **Không insert/update** những computed fields.
- `PurchaseOrders.status`: `VARCHAR(20)` + `CK_PO_Status` chỉ `PENDING, APPROVED, RECEIVED, CANCELED`.
- `PurchaseOrders.createdBy/approvedBy/canceledBy` là FK tới `Staff.id` **BIGINT**, `approvedBy`/`canceledBy` nullable. Approve/cancel cập nhật actor, timestamp và status **trong cùng transaction**.
- `CK_PO_ApprovalInfo`, `CK_PO_CancelInfo` phải thỏa. `PENDING` không có approval/cancel metadata ngoài giá trị NULL thích hợp.
- `supplierName/supplierTaxId/supplierPhone/supplierAddress` trên PO là **snapshot** lúc tạo (BR-84), lấy từ Supplier do server query; xem chi tiết PO ưu tiên snapshot, không tự thay bằng supplier hiện tại.
- `PurchaseOrderItem.quantity` là `DECIMAL(15,3)`, `costPrice` là `DECIMAL(15,2)`, `PurchaseOrders.totalAmount` là `DECIMAL(18,2)`. Xử lý tiền và lượng bằng số thập phân chính xác hoặc tính tổng trong SQL; **không dùng floating-point JS trực tiếp cho tính tiền**. Áp dụng quy tắc làm tròn rõ ràng, không đổi precision trong DB.
- `UQ_POI_PoVariant` unique `(poId,variantId)` → từ chối/tránh duplicate item cho cùng variant trong một PO; validate positive quantity / positive unit cost. Giá mua và snapshot được xác lập tại thời điểm tạo, không nhận tiền từ client làm nguồn chuẩn.
- `Supplier.status` dùng `'Active'/'Inactive'`; `Product.status` dùng `'Selling'/'StopSelling'/'Suspended'` (không được dùng nhầm `ACTIVE/INACTIVE` như ở mapping `ProductSuppliers.status`).
- Tạo PO header + items + `totalAmount` trong **một SQL transaction**; nếu lỗi bất kỳ dòng → rollback tất cả; không để PO rỗng/mất items.
- Approve / cancel phải tránh race condition bằng transaction và **điều kiện trạng thái trong UPDATE**, kiểm tra affected rows (và kiểm tra receipt khi cancel). Không cho thao tác trên trạng thái đã thay đổi bởi request khác.
- Chỉ ghi vào `PurchaseOrders` và `PurchaseOrderItems` đối với UC22–26; UC23/UC24 read-only, UC25/UC26 chỉ đổi PO lifecycle. **Không thay đổi tồn kho.**

### `UQ_GRI_POItem` — đã xác minh lại (2026-11-08)

Bản ghi chú trước đây cho rằng `RetailOne_schema_mssql(4).sql` thiếu `UQ_GRI_POItem UNIQUE ([poItemId])`. **Kiểm tra file thực tế: constraint này CÓ** (dòng 510), cùng `UQ_GRI_Item UNIQUE ([receiptId],[poItemId])` (dòng 509) và `UQ_GR_Po UNIQUE ([poId])` trên `GoodReceipts`. Không cần sửa schema; ghi chú cũ đã lỗi thời. Phần UC31/DB Design vẫn nằm ngoài phạm vi 5 UC. `SupplierReturnItems` có `UQ_SRI_Batch UNIQUE(batchId)`; không code module này.

### SQL foreign key phụ thuộc cần rà

`Users.roleId → Roles.id`; `Staff.userId → Users.id`; `ProductVariants.productId → Products.id`; `ProductSuppliers(productId,supplierId) → Products/Suppliers`; `SupplierProductPrices(supplierId,variantId) → Suppliers/ProductVariants`; `PurchaseOrders.supplierId/createdBy/approvedBy/canceledBy → Suppliers/Staff`; `PurchaseOrderItems.poId/variantId → PurchaseOrders/ProductVariants`; `GoodReceipts.poId → PurchaseOrders` (chỉ để chống hủy). Các bảng quyền `Features/RoleFeatures` cần thiết nếu giữ mô hình permission-key của code cũ.

## 4. Năm use cases phải implement (không thêm tính năng)

### UC22 — Create Purchase Order (Warehouse Staff, Manager)

- Yêu cầu token hợp lệ, role Warehouse Staff hoặc Manager, Staff tồn tại và hợp lệ.
- Nhận **một** active supplierId, danh sách items không rỗng, mỗi item có `variantId`, quantity hợp lệ, note tùy chọn. Không tự nhận giá tiền, supplier snapshot, createdBy hay trạng thái client gửi.
- Chỉ sản phẩm thuộc supplier được map và active; kiểm tra `Products`, `ProductVariants`, `ProductSuppliers`, `SupplierProductPrices` cùng supplierId; phải có supply price > 0. Lấy **giá mua gần nhất** theo `createdAt DESC, id DESC` nếu nghiệp vụ lịch sử giá cho phép.
- Tạo PO `PENDING`, PO code/ID từ SQL, supplier snapshot, items với costPrice snapshot và total tính server, transaction atomic; **inventory không đổi**.
- Implement cả validation và exceptions của UC22: danh sách rỗng, quantity sai, supplier inactive/no mapped products, giá không hợp lệ, rollback khi DB error. `22.1` (create từ low-stock) có thể dùng cùng endpoint với prefilled selection; không cần xây module UC21. `22.2` chỉnh draft chỉ trước submit ở client, không tự thêm trạng thái `DRAFT` vào DB; `22.3` hủy trước submit không ghi dữ liệu.
- **XUNG ĐỘT ĐÃ QUYẾT ĐỊNH (tạm thời):** UC22 E1 viết “non-integer quantity”, còn cột SQL `DECIMAL(15,3)` và `Products.allowDecimalQuantity` cho phép thập phân. Theo quyết định của người dùng: **chỉ chấp nhận quantity là số nguyên dương**; chi tiết ở `docs/work/OPEN-QUESTIONS.md` (Q2).
- **UC22.1 (đã làm):** `GET /api/inventory/suppliers/by-variants?variantIds=1,2,3` trả các supplier `Active` cung cấp các variant đã chọn, giá từ `SupplierProductPrices`; vẫn dùng `POST /purchase-orders` để tạo PO (một supplier/PO). Retry an toàn bằng header `Idempotency-Key` (in-memory, Q17).

### UC23 — View Purchase Orders (Warehouse Staff, Manager)

- Truy vấn read-only, mặc định `createdAt DESC` (có tie-break `id DESC`); trả ID, `poCode`, date, supplier snapshot name, creator, total, status.
- Filter status đúng tập enum; date range có validate; search theo PO ID/code hoặc supplier name; sort theo SRS (`Creation Date, Supplier Name, Total Value, Status`) và whitelist column để chống injection; phân trang nếu API đang hỗ trợ.
- Không có kết quả → response danh sách rỗng/thông báo phù hợp, không biến thành lỗi server; DB error trả mã và log an toàn; không update bất kỳ bảng nào.

### UC24 — View Purchase Order Details (Warehouse Staff, Manager)

- Truy vấn read-only một PO hợp lệ; trả header + snapshot supplier + items/variant + snapshot costPrice + quantity + total + creator/approver/cancel metadata hiện có; not-found có mã lỗi rõ.
- SRS yêu cầu “status history”, nhưng SQL hiện chỉ có status + `createdAt`, `approvedAt`, `canceledAt`, `GoodReceipts.receivedAt`; **không có bảng lịch sử trạng thái PO riêng được chỉ ra trong schema hiện tại**. Trình bày timeline có thể suy từ timestamps nếu đủ và không gọi đó là audit log toàn diện. Nếu yêu cầu ghi đầy đủ mọi chuyển trạng thái, ghi vào `OPEN-QUESTIONS.md` và hỏi trước khi thêm bảng.
- `availableActions` dựa vào role/status là metadata API optional; chưa có frontend nên không tạo nút giao diện.

### UC25 — Approve Purchase Order (Manager ONLY)

- Chỉ Manager đăng nhập và có quyền tương ứng. PO phải tồn tại và còn `PENDING` tại thời điểm update.
- Kiểm tra Supplier vẫn `Active`, các Products/Variants liên quan vẫn hợp lệ theo SRS; nếu inactive → reject.
- Transaction / atomic update: status `APPROVED`, `approvedBy` **Staff.id** của Manager, `approvedAt` server timestamp. Không tăng inventory, không tự nhận hàng.
- Nếu hủy xác nhận ở UI thì chưa gửi mutation request; không tạo API mới.
- Invalid status/authorization/DB failure phải trả lỗi rõ và không ghi dở dữ liệu; xử lý race khi 2 Manager duyệt cùng PO.

### UC26 — Cancel Purchase Order (Manager ONLY)

- Chỉ Manager đăng nhập; PO phải tồn tại và ở `PENDING` hoặc `APPROVED`, `cancelReason` không rỗng (trim, tôn trọng `NVARCHAR(500)`).
- Phải xác nhận **không có GoodReceipt** cho `poId` trước khi hủy; đồng thời bảo đảm không bị race với thao tác nhận hàng. Kiểm tra transaction/lock + state là một thể, không query ngoài transaction rồi update mù.
- Atomic update `status='CANCELED'`, `canceledBy=Staff.id`, `canceledAt=server timestamp`, `cancelReason`. Không xóa header/items, không thay tồn kho, không cho reopen/approve/receive về sau.
- Không sửa status PO khác, không triển khai nghiệp vụ nhận hàng (UC31) trong repo này.

### Quyền truy cập chính xác

| UC | Allowed actors |
|---|---|
| UC22 Create | Manager, Warehouse Staff |
| UC23 List | Manager, Warehouse Staff |
| UC24 Detail | Manager, Warehouse Staff |
| UC25 Approve | Manager ONLY |
| UC26 Cancel | Manager ONLY |

Không suy quyền từ role ID hardcoded (ID phụ thuộc seed). **Quyết định hiện hành:** đúng ba role `Manager`, `Warehouse Staff`, `Cashier` (không alias `Warehouse`); quyền được kiểm tra bằng permission key đọc từ DB ở mỗi request (`Users → Roles → RoleFeatures → Features.featureKey`): `VIEW_PURCHASE_ORDER`, `CREATE_PURCHASE_ORDER` (gồm các API tra cứu supplier/catalog/UC22.1), `APPROVE_PURCHASE_ORDER`, `CANCEL_PURCHASE_ORDER`. Mapping seed ở `src/constants/permissions.js` + `scripts/lib/rbac.js`; enforce **trong middleware (`authorizePermission`) và service (`assertPermission`)**. Token valid nhưng role không đúng phải bị 403. Bảo vệ route trước data access. Không nhận `staffId/managerId` từ request body.

## 5. Cấu trúc code cần giữ và cách giới hạn module

Ưu tiên cấu trúc hiện hữu, ví dụ (tên file có thể điều chỉnh tối thiểu để khớp code cũ):

```text
src/
  index.js
  config/database.js             # SQL Server connection pool
  infrastructure/transaction.js  # SQL Server transaction helper
  constants/permissions.js
  middlewares/auth.middleware.js
  middlewares/permission.middleware.js
  routes/index.route.js
  routes/auth.route.js
  routes/inventory.route.js      # chỉ mount procurement endpoints cần thiết
  controllers/auth.controller.js
  controllers/purchaseOrder.controller.js
  services/auth.service.js
  services/InventoryServices/purchaseOrder.service.js
  repositories/user.repository.js
  repositories/staff.repository.js
  repositories/role.repository.js
  repositories/supplier.repository.js
  repositories/product/product.repository.js
  repositories/product/productUnit.repository.js  # chỉ nếu đổi logic mapping rõ ràng
  repositories/purchaseOrder.repository.js
  models/                        # 1 file/entity (base.model.js, index.js, purchaseOrder.model.js, ...): định nghĩa cột/kiểu/computed, KHÔNG SQL, KHÔNG ORM
  validators/                    # parse + validate input (purchaseOrder, supplier, auth, common)
  dtos/                          # mapping entity -> response
  infrastructure/idempotency.js  # chống tạo PO trùng khi client retry (UC22)
```

- Nếu repository SQL riêng cho variant/supplier price giúp code rõ ràng, thêm vào **cùng layer repositories**; không phải viết hệ thống lớn hơn.
- Model/DTO tầng app KHÔNG bắt buộc trùng 1:1 với bảng SQL; nhưng trường DB phải khớp chính xác script. Không tạo model Mongo. Các business methods trong UML có thể là helper functions trong service/model tương đương, không ép JavaScript giả lập SQL `BIT`/`DECIMAL` runtime type.
- Giữ existing API prefix `/api` và phong cách response `{success,data,message}` khi có thể; các thay đổi route/response phải được ghi trong bảng mapping và test.
- Không mở public CRUD Suppliers/Products chỉ để UI hoạt động. Có thể cung cấp read-only lookup cần thiết cho Postman tạo PO.
- Không giữ `require('./models')` khiến cả bộ Mongoose models bị khởi tạo khi server start. Để lại unused code cũ chỉ trong khu vực tách biệt/không import; ưu tiên xóa file legacy khỏi đường chạy và khỏi unit test phạm vi mới sau khi đã ghi nguồn tham chiếu.
- Nếu package scripts old Mongo không còn phù hợp, viết `npm run dev`, `npm start`, `npm test`, `npm run test:integration` chuẩn mới. Dùng `.env.example` an toàn.

## 6. Kế hoạch migration ưu tiên theo thứ tự

**Phase A — Audit/trace (không sửa nghiệp vụ):** tạo 3 file phân tích ở `docs/work/`, tổng hợp scope, quyền, bảng và test matrix.

**Phase B — SQL foundation:** cấu hình `mssql` pool, DI hoặc function cho repository, transaction chuẩn, error mapping, env/README. Không thực hiện auto DDL. Viết test ping DB không lộ secret; xác định cơ chế test isolation.

**Phase C — Minimal auth & reference reads:** login JWT, middleware kiểm tra token thực, role/permissions thực, mapping User→Staff, reference reads Suppliers/Products/ProductVariants/ProductSuppliers/SupplierProductPrices. Tạo/ghi chú seed account tối thiểu trong DB test qua một script an toàn, idempotent nếu cần, **không hardcode password**.

**Phase D — UC22→UC26:** implement đúng flow, tách controller/service/repository, query parameterized, transaction và state guard; không implement GR confirmation.

**Phase E — Verification & cleanup:** integration tests trên **test DB**, xác nhận không còn Mongo imports trong executable path, chỉ mount routes liên quan, loại tài liệu/scripts Mongo khỏi lệnh runtime, cập nhật README và ma trận coverage.

## 7. Tests / bằng chứng hoàn thành bắt buộc

Ít nhất phải có các test sau, ưu tiên automated integration tests dùng SQL Server test database, không mock cả tầng DB đối với FK/transaction:

- UC22: Warehouse+Manager tạo thành công; một PO/một Supplier, `PENDING`; PO code do DB; supplier snapshot; price snapshot latest; total đúng; không thay tồn kho; empty items, bad quantity, duplicate variant, inactive supplier, unmapped variant, missing/non-positive cost price; rollback khi một item lỗi; không có PO rác.
- UC23: list order newest-first; status/date filters, search PO/supplier, sort whitelist, pagination (nếu dùng), empty result, DB error.
- UC24: detail trả header+items/snapshot; không tìm thấy; không sửa dữ liệu; actor không có quyền bị từ chối.
- UC25: Manager-only, pending→approved, approvedBy/approvedAt đúng Staff ID; inactive supplier/product bị từ chối; double-approve bị chặn; no inventory change; DB failure rollback.
- UC26: Manager-only, PENDING/APPROVED→CANCELED, reason+staff+time, reject empty reason, reject RECEIVED/CANCELED, reject existing GoodReceipt, concurrent cancel/approve, no inventory change, no delete PO/items.
- Auth: no token 401; token invalid/expired 401; Cashier and non-Manager approve/cancel 403; Warehouse view/create allowed; user locked/resigned blocked theo policies có liên quan.
- SQL: FK/CHECK/UNIQUE/IDENTITY/computed columns thực tế hoạt động; queries parameterized; decimal accurate.
- No-frontend: có bộ Postman/curl examples và account test config không lộ password thật.

**Không nói “đã test” nếu chưa chạy.** Báo cáo rõ test nào PASS/FAIL/SKIPPED, vì sao và điều kiện chạy lại. Nếu không có SQLServer host, vẫn làm unit tests, lint/static, và nêu rõ integration chưa chạy.

## 8. Định dạng đầu ra Claude cần trả về

Mỗi lần hoàn thành một phase, trả lời ngắn gọn theo format:

1. **Đã đọc / nguồn áp dụng** (đúng file/mục SRS/constraint SQL/figure).
2. **Đã thay đổi** (từng file và lý do).
3. **Tuân thủ UC/BR nào** (link đến traceability matrix).
4. **Cách chạy** (npm commands + env placeholders + test DB setup an toàn).
5. **Kết quả test** (actual observed, không đoán).
6. **Còn vướng / cần xác nhận** (vấn đề SRS–SQL, không tự sửa quyền hoặc DB).

Các file cần xuất/chăm sóc:
- `docs/work/01-REQUIREMENTS-TRACEABILITY.md`
- `docs/work/02-CURRENT-VS-TARGET.md`
- `docs/work/03-IMPLEMENTATION-PLAN.md`
- `docs/work/OPEN-QUESTIONS.md`
- `docs/work/04-TEST-REPORT.md` (sau khi code)
- `README.md` hướng dẫn run/test bản SQLServer UC22–26 khi đã triển khai xong.

## 9. Những tiêu chí KHÔNG ĐƯỢC dùng làm lý do kết luận đã hoàn thành

- Chỉ sửa `src/models/` nhưng repository vẫn Mongoose → **CHƯA hoàn thành**.
- Có `mssql` dependency nhưng `src/index.js` vẫn gọi `MONGODB_URI` → **CHƯA hoàn thành**.
- API chạy nhưng middleware permission bypass → **CHƯA hoàn thành**.
- POST PO tạo nhiều PO, lưu `Draft`, `Approved` chữ thường/title case hoặc dùng `productUnitId` cũ → **CHƯA hoàn thành**.
- `totalAmount` do client nhập; không rollback khi item #2 lỗi; không chặn approve/cancel đua trạng thái → **CHƯA hoàn thành**.
- Triển khai 5 UC nhưng đồng thời sửa/xóa DB các module không liên quan → **SAI phạm vi**.
- Không chạy integration nhưng khẳng định “100% đúng SQL” → **KHÔNG được**.

---
**Task khởi động đề nghị cho Claude (copy vào chat đầu tiên):**

> Hãy đọc kỹ `CLAUDE.md` rồi kiểm tra toàn bộ `docs/reference` và backend cũ. Trước khi code, lập `01-REQUIREMENTS-TRACEABILITY.md`, `02-CURRENT-VS-TARGET.md`, `03-IMPLEMENTATION-PLAN.md`, và `OPEN-QUESTIONS.md`. Mục tiêu là giữ kiến trúc Node.js/Express, chuyển tầng dữ liệu cần thiết sang SQL Server theo schema mới nhất và implement CHỈ UC22–UC26. Chỉ thay đổi module auth + PO + dependencies tối thiểu. Không tạo frontend, không chạy bất kỳ lệnh DROP DATABASE, không tự sửa schema hay đổi business rules. Sau khi báo cáo ngắn kế hoạch và điểm vướng, tiến hành triển khai phần không mơ hồ, kiểm thử và liệt kê file sửa.
