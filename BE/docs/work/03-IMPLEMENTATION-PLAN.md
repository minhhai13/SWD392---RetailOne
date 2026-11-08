# 03 — IMPLEMENTATION PLAN

Quyết định đã được người dùng xác nhận: giữ kiến trúc Routes → Controllers → Services → Repositories → Models; chỉ UC22–UC26 + auth/RBAC + lookup tối thiểu; DB test tạo từ file SQL (chưa có dữ liệu); quantity nguyên dương; không sửa schema; PASS chỉ khi test đã chạy.

## Phase A — Audit/trace (xong)
- [x] Đọc SRS UC22–26 + BR, schema `(4)`, Figure IV-33 (xem hình), code cũ.
- [x] 4 tài liệu: `01`, `02`, `03`, `OPEN-QUESTIONS`.
- Phát hiện: `UQ_GRI_POItem` **có** trong file SQL (CLAUDE.md lỗi thời) — Q1.

## Phase B — SQL foundation (xong)
1. `npm uninstall` các gói không dùng (mongoose, mongodb-memory-server, socket.io, multer, qrcode, sepay-pg-node, bcrypt, body-parser, crypto); `npm install mssql`.
2. `src/config/database.js` (pool, ping, close) + `src/infrastructure/transaction.js` (`withTransaction`, `LOCK_TIMEOUT`).
3. `src/utils/errors.js` (AppError, mapping lỗi mssql), `src/middlewares/error.middleware.js`, `src/index.js`.
4. `.env.example` (đã có), `.gitignore` kiểm tra `.env`.
5. `scripts/setup-test-db.js`: tạo DB `*_TEST` từ file SQL, bỏ batch DROP/CREATE/USE, từ chối DB đã có bảng. Chạy SQL Server bằng Docker.
6. `docs/work/SCHEMA-VERIFY.md` + test DB-01 (kiểm tra bảng/cột/constraint cần dùng có thật).

## Phase C — Auth, RBAC, lookup (xong)
1. `constants/roles.js`, `constants/purchaseOrder.js`.
2. `user.repository`, `staff.repository`; `auth.service/controller/route` (login, me, logout).
3. `auth.middleware` (JWT + DB identity, locked/resigned), `permission.middleware` (`authorizeRoles`).
4. Lookup read-only: `supplier.repository` (active suppliers, catalog), `supplier.service/controller`.
5. `scripts/lib/fixtures.js` (INSERT helper dùng chung) + `scripts/seed-dev.js` (roles, users, suppliers, products; mật khẩu từ env hoặc sinh ngẫu nhiên).

## Phase D — UC22 → UC26 (xong)
1. `models/purchaseOrder.model.js` (validation/DTO).
2. `productVariant.repository`, `supplierProductPrice.repository`, `purchaseOrder.repository`.
3. `purchaseOrder.service` (create, list, detail, approve, cancel) + controller + `inventory.route.js`.
4. Mount routes trong `routes/index.route.js` (chỉ `/auth`, `/inventory`).

## Phase E — Verification & cleanup (xong)
1. Xóa file Mongo/ngoài scope khỏi `src/`; `grep` xác nhận không còn `mongoose|mongodb`.
2. Test: `test/unit/*.test.js` (không cần DB), `test/integration/*.test.js` (SQL Server thật, node:test, `fetch`, không mock DB).
3. Chạy test thật trên SQL Server Docker; ghi `04-TEST-REPORT.md` (PASS/FAIL/SKIPPED thật).
4. `README.md` mới, bộ curl (`docs/work/API-EXAMPLES.md`), cập nhật trạng thái trong `01`.

## Phase F — Refactor & hoàn thiện cuối (xong, 2026-11-08)
1. Sao lưu project (tar ngoài thư mục project) → tách `models/` theo entity, `validators/`, `dtos/`.
2. RBAC theo `Features/RoleFeatures`, đúng 3 role; `authorizePermission`; `role.repository`.
3. Sửa lỗi sau COMMIT (`loadAfterCommit`, `COMMIT_OUTCOME_UNKNOWN`) + idempotency in-memory cho UC22.
4. UC22.1: `GET /inventory/suppliers/by-variants`.
5. Seed demo idempotent + `db:reset-demo-passwords` (guard `_TEST` + local + `--yes` + chỉ tài khoản demo).
6. Test mới (model↔schema, RBAC, post-COMMIT, idempotency, UC22.1, seed/reset, kiến trúc, deadlock) — sửa deadlock `recalculateTotal` do test tìm ra.
7. Cập nhật CLAUDE.md, README, `docs/work/*`. Xác minh lại `UQ_GRI_POItem` (có trong schema).

## Kết quả thực tế
- Docker SQL Server 2022 (`retailone_sql_test`, cổng 14331) + DB `RetailOnePOS_TEST` tạo từ file schema (42 bảng).
- 135 test (27 unit + 108 integration) PASS: xem `04-TEST-REPORT.md`.
- Container `sql_server_fpt` có sẵn trên máy (cổng 1433) **không được dùng và không bị đụng tới**.

## Rủi ro chính
- Docker/SQL Server image (arm64 Mac: image `mcr.microsoft.com/mssql/server:2022-latest` chạy qua emulation amd64 — đã chạy ổn) → nếu không chạy được, integration test sẽ ghi SKIPPED/FAIL, không báo PASS.
- Tên role seed thật khác (Q4) → chỉnh `constants/roles.js`.
