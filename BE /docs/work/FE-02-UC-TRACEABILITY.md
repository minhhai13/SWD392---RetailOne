# FE-02 — UC TRACEABILITY (Frontend)

`UC Step → UI Action → API → Success/Error Case → Test`. Test ID tham chiếu file trong `FE/tests/` (Vitest + React Testing Library, 117 test) và `FE/scripts/contract-check.mjs` (33 kiểm tra với backend thật). Status = PASS khi test tương ứng đã chạy thật và đạt; luồng UC22–UC26 còn được thao tác thủ công trên giao diện thật (xem `FE-03-TEST-REPORT.md`).
Alt/Exception flows trong SRS được ánh xạ đầy đủ; "(client)" nghĩa là chỉ xảy ra ở giao diện, không có API.

## Auth / RBAC
| Yêu cầu | UI | API | Kết quả | Test | Status |
|---|---|---|---|---|---|
| PRE-1 đăng nhập | Form username/password, required, Enter, hiện/ẩn mật khẩu, spinner | `POST /auth/login` | 200 → lưu token (sessionStorage) → vào danh sách; 401 → "Sai tên đăng nhập hoặc mật khẩu"; 403 (khóa/nghỉ việc) | tests/auth/auth.test.jsx | PASS |
| Khôi phục phiên | Spinner toàn trang khi reload | `GET /auth/me` | 200 → vào lại trang; 401 → về Login | tests/auth/auth.test.jsx | PASS |
| Protected route | Chưa đăng nhập → `/login` (nhớ `from`) | — | sau login quay lại `from` | tests/auth/auth.test.jsx | PASS |
| BR-02 / BR-42 phân quyền UI | Ẩn/hiện menu, nút Tạo/Duyệt/Hủy theo `permissions[]` + `availableActions` | — | Cashier: Forbidden; Warehouse: không có nút Duyệt/Hủy | tests/unit/utils.test.js, auth.test.jsx, poDetail.test.jsx | PASS |
| 401 giữa phiên | Toast + về Login | mọi API | xoá phiên | tests/auth/auth.test.jsx | PASS |
| 403 | Thông báo không đủ quyền, **không** logout | mọi API | giữ phiên | errorMessages.test, tests/pages/poDetail.test.jsx | PASS |
| Logout | Nút Đăng xuất (navbar) | `POST /auth/logout` | xoá phiên, về Login | tests/auth/auth.test.jsx | PASS |

## UC22 — Create Purchase Order
| Step / Flow | UI Action | API | Success / Error | Test | Status |
|---|---|---|---|---|---|
| 22.0.2 | Mở "Tạo đơn mua hàng", danh sách NCC active | `GET /inventory/suppliers` | 200 list; lỗi → ErrorState + Thử lại | tests/pages/poCreate.test.jsx | PASS |
| 22.0.3–4 | Chọn NCC → tải catalog + giá mua | `GET /inventory/suppliers/:id/products` | 200; rỗng → "NCC chưa có sản phẩm" (E2); 422 `SUPPLIER_INACTIVE` | tests/pages/poCreate.test.jsx | PASS |
| 22.0.5 | Tìm trong catalog, thêm dòng, nhập số lượng nguyên dương, ghi chú dòng | — (client) | không thêm trùng variant; quantity hợp lệ | poCreate.test, tests/unit/utils.test.js | PASS |
| 22.0.6 | Tổng tạm tính (preview) | — (client) | hiển thị VND; backend quyết định giá/tổng cuối | tests/pages/poCreate.test.jsx | PASS |
| 22.0.7–8 | Nút "Tạo đơn" | `POST /inventory/purchase-orders` (`supplierId, note, items[variantId, quantity, note]`; header `Idempotency-Key`) | 201 → toast + sang chi tiết, trạng thái PENDING; body **không** chứa giá/tổng/status/actor | tests/pages/poCreate.test.jsx | PASS |
| 22.1 (tối thiểu) | `supplierApi.getSuppliersByVariants` có sẵn; không có màn hình Stock Level | `GET /inventory/suppliers/by-variants` | không bắt buộc | contract-check (33/33) | PASS |
| 22.2 | Sửa số lượng / xóa dòng / thêm dòng, preview cập nhật | — (client) | tổng tạm tính đổi theo | tests/pages/poCreate.test.jsx | PASS |
| 22.3 | Nút "Hủy" / rời trang | — (client) | draft chưa đổi → về danh sách; đã đổi → hỏi xác nhận; không lưu DRAFT | tests/pages/poCreate.test.jsx | PASS |
| 22.0.E1 | Quantity không hợp lệ / danh sách rỗng | (chặn ở client; server 400 `INVALID_QUANTITY`, `EMPTY_ITEMS`, `DUPLICATE_VARIANT`) | lỗi tại field/alert | validators.test, tests/pages/poCreate.test.jsx | PASS |
| 22.0.E2 | NCC không có sản phẩm | `GET …/products` (200 rỗng) hoặc 422 `SUPPLIER_NO_MAPPED_PRODUCTS` | thông báo + chọn NCC khác | tests/pages/poCreate.test.jsx | PASS |
| 22.0.E3 | Lỗi lưu / mạng / timeout | POST | giữ draft; hiện lỗi; thử lại cùng `Idempotency-Key` | tests/pages/poCreate.test.jsx | PASS |
| Conflict | 409 `IDEMPOTENCY_KEY_REUSED`, 422 `VARIANT_NOT_SUPPLIED`/`PRODUCT_INACTIVE`/`PRICE_NOT_CONFIGURED` | POST | thông báo tiếng Việt, giữ draft | errorMessages.test, tests/pages/poCreate.test.jsx | PASS |
| Post-COMMIT | `meta.detailLoaded=false` | POST | coi là thành công, không gửi lại, sang trang chi tiết (GET) | tests/pages/poCreate.test.jsx | PASS |
| COMMIT unknown | `COMMIT_OUTCOME_UNKNOWN` | POST | không khẳng định thành/bại, không tự retry, yêu cầu kiểm tra danh sách | tests/pages/poCreate.test.jsx | PASS |
| Replay | HTTP 200 (thay vì 201) | POST | xử lý như kết quả trước, không tạo thêm | tests/pages/poCreate.test.jsx | PASS |

## UC23 — View Purchase Orders
| Step / Flow | UI Action | API | Success / Error | Test | Status |
|---|---|---|---|---|---|
| 23.0 | Mở danh sách (mặc định mới nhất trước) | `GET /inventory/purchase-orders` | cột: Mã PO, Ngày tạo, NCC, Người tạo, Tổng tiền, Trạng thái, Số dòng, Xem | tests/pages/poList.test.jsx | PASS |
| 23.1 | Lọc trạng thái, khoảng ngày | `status`, `from`, `to` | kết quả khớp; khoảng ngày sai → lỗi tại field, không gọi API | poList.test, tests/unit/utils.test.js | PASS |
| 23.2 | Tìm theo mã PO / tên NCC (debounce) | `q` | kết quả khớp | tests/pages/poList.test.jsx | PASS |
| 23.3 | Sắp xếp theo Ngày tạo / NCC / Tổng tiền / Trạng thái | `sortBy`, `sortDir` | đúng thứ tự | tests/pages/poList.test.jsx | PASS |
| Phân trang | Pagination + page size (≤100); đổi filter → page 1 | `page`, `pageSize` | URL phản ánh đúng | poList.test, tests/unit/utils.test.js | PASS |
| 23.0.E1 | Không có kết quả | — | Empty state "Không tìm thấy đơn mua hàng phù hợp" | tests/pages/poList.test.jsx | PASS |
| 23.0.E2 | Lỗi API | — | Error state + Thử lại | tests/pages/poList.test.jsx | PASS |
| URL state | filter/search/sort/page nằm trong query; quay lại từ chi tiết giữ nguyên | — | — | poList.test, tests/pages/poDetail.test.jsx | PASS |

## UC24 — View Purchase Order Details
| Step / Flow | UI Action | API | Success / Error | Test | Status |
|---|---|---|---|---|---|
| 24.0 | Bấm "Xem" | `GET /inventory/purchase-orders/:id` | header, NCC (snapshot), dòng hàng (giá snapshot), tổng, ghi chú | tests/pages/poDetail.test.jsx | PASS |
| 24.0.3 | Timeline CREATED/APPROVED/RECEIVED/CANCELED (+người, lý do) | (trong response) | ghi chú "suy ra từ mốc thời gian, không phải nhật ký đầy đủ" | tests/pages/poDetail.test.jsx | PASS |
| 24.0.4 | Nút theo `availableActions` ∩ permission | — | Warehouse không thấy Duyệt/Hủy | tests/pages/poDetail.test.jsx | PASS |
| 24.1 | "Quay lại danh sách" giữ filter | — | quay về đúng query | tests/pages/poDetail.test.jsx | PASS |
| 24.0.E1 | PO không tồn tại | 404 `PO_NOT_FOUND` | trang "Không tìm thấy" + link về danh sách | tests/pages/poDetail.test.jsx | PASS |

## UC25 — Approve Purchase Order
| Step / Flow | UI Action | API | Success / Error | Test | Status |
|---|---|---|---|---|---|
| 25.0.1–2 | Bấm "Duyệt đơn" (chỉ Manager, PENDING, `availableActions` có APPROVE) → modal: Mã PO, NCC, Tổng tiền | — | — | tests/pages/poDetail.test.jsx | PASS |
| 25.0.3–5 | "Xác nhận duyệt" | `PATCH …/:id/approve` (không body) | 200 → toast, GET lại chi tiết → APPROVED | tests/pages/poDetail.test.jsx | PASS |
| 25.1 | "Hủy" modal | — (client) | không gọi API | tests/pages/poDetail.test.jsx | PASS |
| 25.0.E1 | 409 `PO_INVALID_STATUS` | PATCH | thông báo + reload | tests/pages/poDetail.test.jsx | PASS |
| 25.0.E2 | 422 `SUPPLIER_INACTIVE` / `PRODUCT_INACTIVE` | PATCH | thông báo, PO vẫn PENDING | tests/pages/poDetail.test.jsx | PASS |
| 25.0.E3 | 500 `DB_ERROR`, `COMMIT_OUTCOME_UNKNOWN`, mạng | PATCH | hướng dẫn kiểm tra trạng thái; không tự retry; reload | tests/pages/poDetail.test.jsx | PASS |
| 403 | không đủ quyền | PATCH | thông báo, không logout | tests/pages/poDetail.test.jsx | PASS |
| Double submit | bấm nhiều lần | PATCH | chỉ 1 request | tests/pages/poDetail.test.jsx | PASS |

## UC26 — Cancel Purchase Order
| Step / Flow | UI Action | API | Success / Error | Test | Status |
|---|---|---|---|---|---|
| 26.0.1–3 | "Hủy đơn" (Manager, PENDING/APPROVED) → modal nhập lý do (đếm ký tự, tối đa 500) | — | — | tests/pages/poDetail.test.jsx | PASS |
| 26.0.E2 | Lý do rỗng / chỉ khoảng trắng / >500 | (chặn ở client) | lỗi tại field | validators.test, tests/pages/poDetail.test.jsx | PASS |
| 26.0.4–6 | "Xác nhận hủy" | `PATCH …/:id/cancel` `{reason}` (đã trim) | 200 → toast, GET lại → CANCELED + hiển thị lý do | tests/pages/poDetail.test.jsx | PASS |
| 26.1 | Đóng modal | — (client) | không gọi API | tests/pages/poDetail.test.jsx | PASS |
| 26.0.E1 | RECEIVED/CANCELED: không có nút; 409 `PO_INVALID_STATUS`, `GOODS_RECEIPT_EXISTS` | PATCH | thông báo + reload | tests/pages/poDetail.test.jsx | PASS |
| Concurrency | 409 `CONCURRENT_UPDATE` | PATCH | thông báo thử lại + reload | tests/pages/poDetail.test.jsx | PASS |
| 26.0.E3 | lỗi mạng/DB/COMMIT unknown | PATCH | như UC25 | tests/pages/poDetail.test.jsx | PASS |
