# FE-04 — DEMO GUIDE (RetailOne Procurement, UC22–UC26)

Không ghi mật khẩu thật trong tài liệu: mật khẩu 3 tài khoản demo là các giá trị `SEED_*_PASSWORD` bạn đã đặt trong `.env` của backend (hoặc script seed in ra).

## 1. Chuẩn bị (3 terminal)
```bash
# Terminal 1 - SQL Server phải đang chạy (docker ps), DB đã seed (xem README backend)
# Terminal 2 - Backend  (cổng 5001; cổng 5000 bị macOS AirPlay chiếm)
cd /Users/minhhai1209/SWD392/DoMinhHai_HE190261_UC22-UC26
npm start

# Terminal 3 - Frontend
cd /Users/minhhai1209/SWD392/FE
cp .env.example .env        # lần đầu; VITE_API_BASE_URL=http://localhost:5001/api
npm install                 # lần đầu
npm run dev                 # mở địa chỉ Vite in ra (thường http://localhost:5173; nếu bận Vite tự chọn cổng khác)
```
Kiểm tra backend: `http://localhost:5001/api/health` → `{"success":true,...}`.

## 2. Tài khoản demo
| Username | Vai trò | Quyền với UC22–26 |
|---|---|---|
| `manager` | Manager | Xem, tạo, duyệt, hủy |
| `warehouse` | Warehouse Staff | Xem, tạo (không duyệt/hủy) |
| `cashier` | Cashier | Không truy cập |

## 3. Kịch bản demo 5 UC (đề xuất ≈ 10 phút)
1. **Login** (Manager): mở trang → nhập sai mật khẩu để thấy thông báo lỗi → đăng nhập đúng. Header hiển thị tên + vai trò.
2. **UC23 – Danh sách**: xem danh sách mới nhất trước → lọc **Trạng thái = Chờ duyệt** → chọn **Từ/Đến ngày** → gõ mã hoặc tên NCC vào ô tìm kiếm → bấm tiêu đề cột **Tổng tiền** để sắp xếp → chuyển trang / đổi "Số dòng / trang". Chú ý thanh địa chỉ thay đổi theo bộ lọc (copy URL mở lại vẫn đúng).
3. **UC24 – Chi tiết**: bấm **Xem** một đơn → xem thông tin NCC (snapshot), dòng hàng, tổng, **dòng thời gian**. Bấm **Quay lại danh sách** → bộ lọc và trang được giữ nguyên.
4. **UC22 – Tạo đơn**: sidebar **Tạo đơn mua hàng** → chọn NCC (đổi NCC khi đã có dòng hàng sẽ hỏi xác nhận) → tìm và **Thêm** sản phẩm (nút chuyển "Đã thêm", không trùng) → nhập số lượng (thử `1.5` hoặc `0` để thấy lỗi) → xóa/sửa dòng (22.2) → xem tổng tạm tính → **Tạo đơn mua hàng**. Hệ thống mở chi tiết đơn ở trạng thái **Chờ duyệt**. Thử **Hủy** khi đã có dòng hàng để thấy hộp thoại rời trang (22.3).
5. **UC25 – Duyệt** (Manager): mở một đơn *Chờ duyệt* → **Duyệt đơn** → modal hiển thị mã đơn, NCC, tổng → **Xác nhận duyệt** → toast + trạng thái **Đã duyệt**, hiển thị người/giờ duyệt.
6. **UC26 – Hủy** (Manager): mở đơn *Chờ duyệt* hoặc *Đã duyệt* → **Hủy đơn** → bấm xác nhận khi chưa nhập lý do (bị chặn) → nhập lý do → **Xác nhận hủy đơn** → trạng thái **Đã hủy**, banner hiển thị lý do, nút hành động biến mất.
7. **Phân quyền**: đăng xuất → đăng nhập `warehouse` → xem/tạo được nhưng **không có** nút Duyệt/Hủy → đăng xuất → `cashier` → trang "Bạn không đủ quyền truy cập chức năng này", không có menu.

## 4. Các trường hợp tiêu cực nên cho giảng viên xem
| Tình huống | Cách làm | Kết quả |
|---|---|---|
| Đơn không còn hợp lệ để duyệt/hủy | Mở cùng một đơn ở 2 tab; duyệt ở tab 1, rồi duyệt/hủy ở tab 2 | Tab 2 báo "Trạng thái đơn không còn hợp lệ…" và tải lại trạng thái mới |
| Hủy đơn đã `Đã hủy`/`Đã nhận hàng` | Mở đơn đã hủy | Không có nút Duyệt/Hủy |
| Đơn không tồn tại | Mở `/purchase-orders/999999` | Trang "Không tìm thấy đơn mua hàng" + nút về danh sách |
| Backend tắt | Dừng backend rồi tải lại danh sách | Trạng thái lỗi + nút **Thử lại** |
| Hết phiên | Xóa token (DevTools → Application → Session Storage) rồi thao tác | Về trang đăng nhập |
| Khoảng ngày sai | Từ ngày > Đến ngày | Báo lỗi tại bộ lọc, không gọi API |
| Số lượng sai / không có sản phẩm | Xem bước 4 | Báo lỗi tại field / alert |
| Reload trang chi tiết | F5 | Phiên được khôi phục qua `/auth/me` |

## 5. Dùng DB `RetailOnePOS` thật của bạn
Backend `.env` đã trỏ `DB_NAME=RetailOnePOS`. Frontend không cần đổi gì ngoài `VITE_API_BASE_URL` khớp cổng backend. Lưu ý: demo sẽ tạo/duyệt/hủy đơn thật trong DB đó.

## 6. Chạy test
```bash
cd /Users/minhhai1209/SWD392/FE
npm test                    # 117 test (Vitest)
npm run lint && npm run build
# kiểm tra contract với backend thật (đặt mật khẩu bằng biến môi trường, không ghi vào file):
CONTRACT_API_BASE=http://localhost:5001/api CONTRACT_MANAGER_PASSWORD=... CONTRACT_WAREHOUSE_PASSWORD=... CONTRACT_CASHIER_PASSWORD=... npm run contract
```
