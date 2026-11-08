# RetailOne POS — UC22–UC26 (Node.js/Express 5 + SQL Server)

Backend nhỏ gồm **5 use case** quản lý Purchase Order (+ alternative flow UC22.1) cùng hạ tầng cần thiết: đăng nhập JWT (bcrypt), phân quyền theo `Roles/Features/RoleFeatures`, API tra cứu tối thiểu. Chưa có frontend (bước tiếp theo: React).

| UC | Chức năng | Manager | Warehouse Staff | Cashier |
|---|---|:-:|:-:|:-:|
| UC22 (+22.1) | Create Purchase Order (+ tra cứu supplier/catalog, tạo từ danh sách low-stock) | ✅ | ✅ | ❌ |
| UC23 | View Purchase Orders | ✅ | ✅ | ❌ |
| UC24 | View Purchase Order Details | ✅ | ✅ | ❌ |
| UC25 | Approve Purchase Order | ✅ | ❌ | ❌ |
| UC26 | Cancel Purchase Order | ✅ | ❌ | ❌ |

Kiến trúc: `Routes → Controllers → Services → Repositories → SQL Server`, cùng `Models` (định nghĩa entity), `Validators` (input), `DTOs` (response). CommonJS, Express 5, `mssql`, SQL luôn có tham số.

## Frontend (React) — thư mục `../FE`
```bash
# Terminal 1 — Backend (thư mục này)
npm install
npm start                    # http://localhost:5001  (npm run dev để tự reload)

# Terminal 2 — Frontend
cd ../FE
cp .env.example .env         # VITE_API_BASE_URL=http://localhost:5001/api (khớp PORT backend)
npm install
npm run dev                  # Vite in ra địa chỉ (thường http://localhost:5173; nếu bận sẽ chọn cổng khác)
```
Hướng dẫn demo 5 UC, tài khoản và các trường hợp tiêu cực: [`docs/work/FE-04-DEMO-GUIDE.md`](docs/work/FE-04-DEMO-GUIDE.md). Kế hoạch/traceability/test: `docs/work/FE-01…FE-03`, phát hiện tích hợp: [`docs/work/FE-OPEN-QUESTIONS.md`](docs/work/FE-OPEN-QUESTIONS.md). Phần backend bên dưới giữ nguyên.

## 1. Cài đặt SQL Server local (Docker, SQL Authentication `sa`)
```bash
npm install
docker run -d --name retailone_sql_test -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=<mật-khẩu-mạnh-của-bạn>' -p 14331:1433 mcr.microsoft.com/mssql/server:2022-latest
cp .env.example .env
```
Điền `.env` (file này đã nằm trong `.gitignore`, **không commit**):
```ini
PORT=5000
DB_SERVER=localhost
DB_PORT=14331
DB_NAME=RetailOnePOS_TEST
DB_USER=sa
DB_PASSWORD=<mật-khẩu-mạnh-của-bạn>
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
JWT_SECRET=<chuỗi-ngẫu-nhiên-dài, ví dụ: openssl rand -hex 32>
JWT_EXPIRES_IN=1d
# tuỳ chọn: mật khẩu tài khoản demo (>= 8 ký tự); bỏ trống thì script tự sinh và in ra một lần
SEED_MANAGER_PASSWORD=
SEED_WAREHOUSE_PASSWORD=
SEED_CASHIER_PASSWORD=
```
Nếu đã có SQL Server cài sẵn (Windows/Mac), dùng `DB_SERVER=localhost`, `DB_PORT=1433` và tài khoản `sa` (bật SQL Server Authentication). Không ghi mật khẩu `sa` hay JWT secret thật vào README/code.

## 2. Tạo database và seed dữ liệu mẫu
```bash
npm run db:setup-test   # tạo DB RetailOnePOS_TEST từ docs/reference/RetailOne_schema_mssql(4).sql (42 bảng)
npm run db:seed-dev     # Roles/Features/RoleFeatures + 3 tài khoản + supplier/product/giá/tồn kho + 4 PO mẫu
npm start               # http://localhost:5000   (npm run dev: tự reload)
```
- `db:setup-test` **không chạy `DROP DATABASE`**: bỏ qua các lệnh `USE/DROP/CREATE DATABASE` đầu file, chỉ chạy khi `DB_NAME` kết thúc `_TEST` và DB chưa có bảng.
- `db:seed-dev` **idempotent** (chạy lại không tạo trùng), không xóa/sửa dữ liệu cũ, không đổi mật khẩu tài khoản đã có, chỉ chạy với DB `*_TEST` ở máy local (`localhost/127.0.0.1`).
- Dữ liệu mẫu: supplier `Demo Fresh Foods Co.` và `Demo Beverage Distribution` (Active), `Demo Legacy Supplier (inactive)`; sản phẩm gạo/mì (pack+carton)/trà/nước (bottle+case)/sữa (2 supplier), 1 sản phẩm ngừng bán; lịch sử giá; tồn kho thấp để thử UC22.1; PO `PENDING` ×2, `APPROVED` ×1, `CANCELED` ×1 (đánh dấu `note = DEMO-SEED:...`).

### Đăng nhập bằng tài khoản mẫu
| username | Role | Mật khẩu |
|---|---|---|
| `manager` | Manager | `SEED_MANAGER_PASSWORD` trong `.env`, hoặc giá trị seed in ra lần đầu |
| `warehouse` | Warehouse Staff | `SEED_WAREHOUSE_PASSWORD` / giá trị seed in ra |
| `cashier` | Cashier | `SEED_CASHIER_PASSWORD` / giá trị seed in ra |
```bash
curl -s -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"manager","password":"<mật khẩu>"}'
```
Token trả về dùng dạng `Authorization: Bearer <token>`.

### Quên mật khẩu demo → đặt lại
```bash
npm run db:reset-demo-passwords -- --yes
```
Lệnh riêng, **không bao giờ chạy ngầm khi seed**. Kiểm tra trước khi làm: `DB_NAME` phải kết thúc `_TEST`, `DB_SERVER` phải là máy local, bắt buộc có `--yes`, và chỉ đặt lại tài khoản demo (nhận biết bằng `Staff.email` kết thúc `@demo.retailone.local`); tài khoản khác bị bỏ qua dù trùng username. Mật khẩu mới lấy từ `SEED_*_PASSWORD` hoặc tự sinh và in ra một lần.

## 2b. Dùng database `RetailOnePOS` (không có đuôi `_TEST`) trên SQL Server của bạn
Các lệnh `db:setup-test`, `db:seed-dev`, `db:reset-demo-passwords` cố ý từ chối DB không có đuôi `_TEST`. Với DB của bạn hãy sinh file SQL rồi tự chạy (SSMS / Azure Data Studio / sqlcmd):
```bash
# .env: DB_SERVER=localhost, DB_PORT=1433, DB_NAME=RetailOnePOS, DB_USER=sa, DB_PASSWORD=..., JWT_SECRET=..., SEED_*_PASSWORD=... (>= 8 ký tự)
npm run db:generate-sql -- RetailOnePOS
```
Tạo thư mục `generated/` (đã `.gitignore`) gồm: `01-schema-no-drop.sql` (schema **không** có `DROP/CREATE DATABASE`, chỉ chạy trên DB **trống**) và `02-seed-demo.sql` (dữ liệu mẫu, idempotent, chỉ INSERT thứ còn thiếu, chỉ chứa hash bcrypt). Chạy trước `01` (nếu DB chưa có bảng) rồi `02`. Sau đó `npm start`. Xem hướng dẫn từng bước trong câu trả lời hướng dẫn kết nối hoặc chạy `sqlcmd` như sau:
```bash
docker cp generated/01-schema-no-drop.sql <tên-container>:/tmp/01.sql
docker cp generated/02-seed-demo.sql      <tên-container>:/tmp/02.sql
docker exec -it <tên-container> /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -i /tmp/01.sql   # nhập mật khẩu sa khi được hỏi
docker exec -it <tên-container> /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -i /tmp/02.sql
```
(image cũ dùng `/opt/mssql-tools/bin/sqlcmd` và không cần `-C`.)

## 3. Role / Feature mapping (RBAC)
Quyền được đọc từ SQL Server **ở mỗi request** (`Users → Roles → RoleFeatures → Features.featureKey`) nên đổi mapping có hiệu lực ngay; không hardcode Role ID.

| Feature key | Dùng cho | Manager | Warehouse Staff | Cashier |
|---|---|:-:|:-:|:-:|
| `VIEW_PURCHASE_ORDER` | UC23, UC24 | ✅ | ✅ | ❌ |
| `CREATE_PURCHASE_ORDER` | UC22, UC22.1 và `GET /inventory/suppliers*` | ✅ | ✅ | ❌ |
| `APPROVE_PURCHASE_ORDER` | UC25 | ✅ | ❌ | ❌ |
| `CANCEL_PURCHASE_ORDER` | UC26 | ✅ | ❌ | ❌ |

Thiếu/sai token → `401`; đã đăng nhập nhưng thiếu quyền, tài khoản khóa hoặc nhân viên đã nghỉ → `403`. Nguồn seed của mapping: `src/constants/permissions.js` (`ROLE_PERMISSIONS`) → `scripts/lib/rbac.js`.

## 4. API (prefix `/api`, response `{success, data, message}`; lỗi thêm `code`)
| Method & path | UC |
|---|---|
| `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | đăng nhập (`user.permissions[]` trả về cho frontend) |
| `GET /inventory/suppliers` · `GET /inventory/suppliers/:id/products` | tra cứu UC22 |
| **`GET /inventory/suppliers/by-variants?variantIds=1,2,3`** | **UC22.1**: supplier Active cung cấp các variant đã chọn |
| `POST /inventory/purchase-orders` (header tuỳ chọn `Idempotency-Key`) | UC22 |
| `GET /inventory/purchase-orders?status&from&to&q&sortBy&sortDir&page&pageSize` | UC23 |
| `GET /inventory/purchase-orders/:id` | UC24 |
| `PATCH /inventory/purchase-orders/:id/approve` | UC25 |
| `PATCH /inventory/purchase-orders/:id/cancel` body `{ "reason": "…" }` | UC26 |
| `GET /health` | kiểm tra DB |

Ví dụ curl, mã lỗi, Postman collection: [`docs/work/API-EXAMPLES.md`](docs/work/API-EXAMPLES.md), [`docs/work/postman/`](docs/work/postman/).

### Hành vi quan trọng cho frontend
- **UC22.1**: gọi `by-variants` với các variant được chọn từ danh sách low-stock → mỗi supplier trả `coversAll`, `coveredVariantIds`, `missingVariantIds`, `items[{variantId, supplyPrice}]` (giá lấy từ DB). Người dùng chọn **một** supplier, frontend điền sẵn `items` rồi gọi `POST /purchase-orders` (một PO không trộn nhiều supplier). Không có supplier phù hợp → `200`, `suppliers: []` và message.
- **Sau COMMIT**: nếu ghi DB đã thành công nhưng đọc lại PO để tạo response bị lỗi, API vẫn trả `2xx` (201/200) với thân tối giản và `meta.detailLoaded=false`; frontend gọi `GET /purchase-orders/:id` để lấy đầy đủ. Nếu chính lệnh COMMIT không xác nhận được → `500 COMMIT_OUTCOME_UNKNOWN` (đã rollback phía client; kiểm tra danh sách trước khi tạo lại, hoặc dùng `Idempotency-Key`).
- **Retry UC22**: gửi cùng `Idempotency-Key` (8–128 ký tự `A-Za-z0-9_-`) → lần đầu `201`, lần sau `200` + header `Idempotent-Replay: true` và cùng PO; cùng key nhưng nội dung khác → `409 IDEMPOTENCY_KEY_REUSED`. Lưu trong bộ nhớ tiến trình (10 phút); bản bền vững cần đổi schema (`OPEN-QUESTIONS.md` Q17).
- Quantity chỉ nhận **số nguyên dương**. `timeline` ở UC24 suy từ các cột thời gian, không phải audit log.

## 5. Cấu trúc thư mục
```text
src/
  index.js                      Express app + start/stop
  config/database.js            SQL Server pool (mssql)
  constants/                    roles.js, permissions.js, purchaseOrder.js
  routes/                       index, auth, inventory   -> chỉ gọi controllers/middlewares
  controllers/                  auth, purchaseOrder, supplier -> HTTP <-> service
  services/                     auth.service, InventoryServices/{purchaseOrder,supplier}.service -> nghiệp vụ, transaction
  repositories/                 SQL tham số hóa (user, staff, role, supplier, productVariant, supplierProductPrice, purchaseOrder)
  models/                       base.model.js, index.js + 14 file entity (mỗi bảng một file)
  validators/                   common, auth, supplier, purchaseOrder
  dtos/                         auth, supplier, purchaseOrder
  middlewares/                  auth (JWT + quyền từ DB), permission (authorizePermission), error
  infrastructure/               transaction.js (withTransaction), idempotency.js
  utils/                        errors.js, ids.js
scripts/                        setup-test-db, seed-dev, reset-demo-passwords, lib/{rbac,fixtures,demoSeed}
test/                           unit/ (không cần DB), integration/ (SQL Server thật), helpers/
docs/reference, docs/work, docs/legacy
```
Trách nhiệm: **Model** mô tả bảng (tên cột, kiểu, nullable, IDENTITY, computed/read-only, DEFAULT, PK) — không SQL; **Validator** parse/kiểm tra input; **DTO** ánh xạ entity → response; **Service** quy tắc nghiệp vụ, quyền, transaction; **Repository** SQL tham số hóa, nhận `executor` để cùng transaction; **Infrastructure** transaction/idempotency.

## 6. Test
```bash
npm run test:unit          # không cần DB
npm run test:integration   # SQL Server thật; DB_NAME phải kết thúc _TEST
npm test                   # cả hai
```
Kết quả đã chạy thực tế: [`docs/work/04-TEST-REPORT.md`](docs/work/04-TEST-REPORT.md).

## 7. Phạm vi và vấn đề còn mở
Không có UC21, UC27+ (đặc biệt UC31 nhận hàng), tồn kho, bán hàng. Các điểm cần xác nhận (quantity thập phân, lịch sử trạng thái, idempotency bền vững, UC22.1 "any vs all supplier"…) ở [`docs/work/OPEN-QUESTIONS.md`](docs/work/OPEN-QUESTIONS.md). Schema `(4)` có `UQ_GRI_POItem` (đã xác minh), xem [`docs/work/SCHEMA-VERIFY.md`](docs/work/SCHEMA-VERIFY.md).
