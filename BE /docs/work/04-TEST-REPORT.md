# 04 — TEST REPORT

Chạy ngày 2026-11-08 (sau refactor cuối). Mọi kết quả dưới đây là **quan sát thực tế** từ `npm test` (chạy 2 lần liên tiếp, cùng kết quả).

## Môi trường
- Node.js v25.5.0, npm 11.8.0, macOS (Apple Silicon).
- SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022-latest`) trong Docker, container riêng `retailone_sql_test` (cổng 14331, linux/amd64 qua emulation). Container `sql_server_fpt` có sẵn của dự án khác không được dùng.
- DB `RetailOnePOS_TEST` tạo bằng `npm run db:setup-test` từ `docs/reference/RetailOne_schema_mssql(4).sql` (42 bảng).
- Integration test dùng Express app thật + SQL Server thật (không mock DB). Harness từ chối chạy nếu `DB_NAME` không kết thúc `_TEST`. Mỗi file test tạo user/supplier/product tên duy nhất và xóa sạch ở teardown (các test không để lại dòng PO/Supplier/Product/Staff/User). Riêng `seed.test.js` cố ý để lại dữ liệu demo (đó chính là dữ liệu seed).

## Lệnh
```bash
npm test                      # unit + integration
npm run test:unit             # không cần DB
npm run test:integration      # cần SQL Server test DB
```

## Kết quả: 135 tests — 135 PASS, 0 FAIL, 0 SKIPPED (≈ 17 s)

| File | Tests | Kết quả | Nội dung |
|---|---:|---|---|
| `test/unit/validators.test.js` | 7 | PASS | V-01…V-07: validators (create/list/cancel/idempotency-key/variantIds/login/ids) |
| `test/unit/models-dtos.test.js` | 9 | PASS | M-01…M-05 entity models (read-only computed/IDENTITY, kiểu INT vs BIGINT, DECIMAL, hydrate, giới hạn khớp schema), D-01…D-03 DTO, R-01 3 role + mapping |
| `test/unit/infrastructure.test.js` | 5 | PASS | I-01…I-05: mapping lỗi SQL, config, idempotency store, guard seed/reset, mật khẩu demo |
| `test/unit/architecture.test.js` | 6 | PASS | A-01…A-06: import không vỡ, **không circular dependency**, phân tầng, không SQL trong model/dto/validator, SQL tham số hóa, không Mongo/Socket.IO, chỉ mount `/auth` + `/inventory` |
| `test/integration/foundation.test.js` | 5 | PASS | DB-01, SQL-01 (IDENTITY/computed), SQL-02 (CHECK/UNIQUE/FK), SQL-03 (decimal chính xác) |
| `test/integration/model-schema.test.js` | 14 | PASS | MODEL-01: 14 model khớp bảng thật (cột, kiểu, nullable, IDENTITY, computed, DEFAULT, PK) |
| `test/integration/auth.test.js` | 9 | PASS | A-01…A-10: 401/403, token sai/hết hạn, locked/resigned, không nhận actor id từ body, route cũ đã bỏ |
| `test/integration/rbac.test.js` | 5 | PASS | RBAC-01…05: mapping Roles/Features/RoleFeatures, ma trận quyền, `RoleFeatures` là nguồn sự thật, role alias vô quyền |
| `test/integration/uc22.test.js` | 20 | PASS | 22-01…22-20 |
| `test/integration/uc22-1.test.js` | 9 | PASS | 22.1-01…22.1-09 |
| `test/integration/uc22-resilience.test.js` | 8 | PASS | 22-21…22-28: lỗi đọc sau COMMIT, COMMIT lỗi, idempotency, song song |
| `test/integration/uc23-uc24.test.js` | 14 | PASS | 23-01…23-09, 24-01…24-06 |
| `test/integration/uc25.test.js` | 9 | PASS | 25-01…25-09 |
| `test/integration/uc26.test.js` | 11 | PASS | 26-01…26-11 |
| `test/integration/seed.test.js` | 4 | PASS | SEED-01…04: idempotent, dữ liệu hợp lệ, luồng demo, reset mật khẩu có guard |

Tổng: unit 27 + integration 108 = 135.

## Các phát hiện trong quá trình test (đã xử lý)
1. **Deadlock khi tạo PO song song** (test 22-26/22-28 tìm ra): `UPDATE PurchaseOrders SET totalAmount = (SELECT SUM(total) …)` quét `PurchaseOrderItems` và chờ dòng chưa commit của PO khác → lỗi 1205, API trả 409 sau ~10 s. Đã sửa bằng hint `INDEX (UQ_POI_PoVariant)`; sau sửa 4–12 request song song đều 201 trong vài chục ms (OPEN-QUESTIONS Q20).
2. Dữ liệu demo cũ trong DB thử của tôi (từ bản seed trước, cùng `taxId`) làm SEED-02/03 fail lần đầu; đã dọn các dòng demo cũ bằng câu lệnh có điều kiện chặt rồi seed lại — không phải lỗi code (seed tra cứu theo khóa tự nhiên và không ghi đè dữ liệu có sẵn).
3. Lỗi trong chính test (đã sửa test, không đổi code nguồn): một assert luôn đúng ở RBAC-02, vài test tĩnh quá chặt (comment chứa từ "Mongoose", whitelist nội suy).

## Điểm đáng chú ý đã chứng minh bằng test thật
- **Sau COMMIT**: đọc lại PO lỗi sau khi ghi thành công → create/approve/cancel trả 2xx + `meta.detailLoaded=false`, PO vẫn tồn tại, không rollback, không tạo trùng (22-21, 22-22). COMMIT lỗi → `COMMIT_OUTCOME_UNKNOWN`, không còn dữ liệu dở (22-23). Lỗi trước COMMIT → rollback toàn bộ (22-15, 25-08, 26-10).
- **Idempotency**: retry cùng key → cùng PO (201 rồi 200 + `Idempotent-Replay`); 8 request song song cùng key → đúng 1 PO; cùng key khác nội dung → 409; request lỗi không bị ghi nhớ (22-24…22-27).
- **Song song**: 2 Manager duyệt cùng PO → 1 thắng; cancel×cancel; cancel×approve; phiếu nhận đang ghi dở khiến cancel chờ rồi bị từ chối (25-06, 26-06, 26-07); 12 PO tạo song song đều đủ items và đúng tổng (22-28).
- **RBAC theo Features**: đúng ma trận 3 role; xóa `APPROVE_PURCHASE_ORDER` khỏi Manager → 403 ngay, cấp `CANCEL_PURCHASE_ORDER` cho Warehouse → hủy được (có khôi phục); role `Warehouse` (alias) không có quyền (RBAC-02…05).
- **Model**: 14 model khớp schema thật; computed/IDENTITY không ghi được (MODEL-01, M-02, SQL-01).
- **UC22.1**: supplier Active, mapping ACTIVE, product Selling, giá mới nhất từ DB; client gửi `price` bị bỏ qua; PO không trộn supplier (22.1-01…09).
- **Seed**: chạy 3 lần không tạo thêm bản ghi nào; reset mật khẩu chỉ cho tài khoản demo, tài khoản thật (hoặc email giả dạng demo) không bị đụng (SEED-01…04).
- **Kiến trúc**: không circular dependency, không import vỡ, model/dto/validator không chứa SQL, controllers không gọi repository, services không dùng `mssql` trực tiếp.

## Đã thử thủ công (không tính vào 135 test)
`db:reset-demo-passwords` (không `--yes` → từ chối; có `--yes` → đặt lại 3 tài khoản) → `npm start` → curl: login, `/auth/me` (permissions), Cashier 403, danh sách PO demo (4), `by-variants` với 4 variant low-stock, tạo PO với `Idempotency-Key` (201) rồi gửi lại (200 + `Idempotent-Replay: true`).

## CHƯA kiểm thử / giới hạn
- Chưa chạy trên SQL Server ngoài Docker, collation phân biệt hoa thường, múi giờ khác (Q8, Q14). Chưa có test tải/hiệu năng.
- UC31 chưa tồn tại nên deadlock thực tế giữa UC31 và UC26 chưa kiểm chứng (Q13).
- Idempotency chỉ trong bộ nhớ một tiến trình (Q17); không thử nhiều instance.
- Postman collection (`docs/work/postman/`) chưa chạy bằng Postman/Newman; các lệnh curl tương ứng đã chạy tay.
- Không có frontend, không test giao diện.
