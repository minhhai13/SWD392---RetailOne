# LocalStore POS backend — MongoDB

Express/CommonJS, npm. Luồng: route → controller → service → repository → Mongoose schema → MongoDB.
Endpoints và chuỗi middleware được giữ nguyên. `permission.middleware.js` và `sse.service.js` giữ nguyên chính xác nội dung chưa commit có sẵn trong workspace.

## Chạy local bằng PowerShell

```powershell
cd D:\LocalStorePOS\localstore-pos\backend
npm ci
docker compose up -d --wait
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/localstore_pos?replicaSet=rs0&directConnection=true'
$env:JWT_SECRET = 'replace-with-your-local-secret'
$env:JWT_EXPIRES_IN = '1d'
$env:SEED_PASSWORD = '123456'
npm run seed
npm start
```

Seed tạo ba tài khoản `admin@pos.com`, `cashier@pos.com`, `warehouse@pos.com`, nhân viên, quyền và Quầy 1. Seed chỉ tạo dữ liệu thiếu, không đặt lại mật khẩu tài khoản đã tồn tại. Dùng trên database phát triển. Quầy mặc định vẫn là ID số `1` trong `src/config/pos.config.js`.

## Thêm dữ liệu demo để thử giao diện

```powershell
# Replica set Docker của máy này đang chạy ở 27018.
$env:MONGODB_URI = 'mongodb://127.0.0.1:27018/localstore_pos?replicaSet=rs0&directConnection=true'
$env:SEED_PASSWORD = '123456'
npm run seed:demo
```

Lệnh này tạo 50 sản phẩm (92 đơn vị/barcode, gồm hàng cân ký và 2 combo), 12 danh mục, 40 khách hàng, 6 nhà cung cấp, 12 phiếu nhập, 93 hóa đơn (80 đã thanh toán, 6 nháp, 4 chờ chuyển khoản, 3 hủy), 4 khuyến mãi, 6 voucher, 6 hoàn trả, 3 kiểm kê, 3 báo hàng lỗi, 5 nhân viên bổ sung, 4 ca làm, lịch làm 30 ngày trước đến 7 ngày sau và 5 bảng lương tháng trước. Dữ liệu ngày tháng được tính từ lần chạy đầu; có dữ liệu hôm nay cho dashboard.

Hóa đơn chưa thanh toán luôn có `Invoice.status = UNPAID`, gồm cả 4 hóa đơn đã tạo ý định chuyển khoản; trạng thái `PENDING` nằm trên bản ghi Payment. Điều này khớp với luồng POS web hiện tại. Khi chạy lại seed trên batch cũ, lệnh chỉ chuẩn hóa các invoice demo `PENDING` có payment chuyển khoản đang `PENDING` về `UNPAID`, giữ nguyên payment, số tiền, tồn kho và điểm.

Mã sản phẩm `DEMO-P001`…`DEMO-P048`, combo `DEMO-C1`/`DEMO-C2`; barcode EAN-13 bắt đầu `290`. Voucher còn hoạt động: `DEMO10`, `DEMO20K`, `DEMO5K`; các mã `DEMOHETHAN`, `DEMODUNG`, `DEMOHETLUOT` dùng thử trường hợp hết hạn, vô hiệu hóa và hết lượt. Tài khoản bổ sung: `demo.cashier1@pos.com` đến `demo.cashier3@pos.com`, `demo.warehouse1@pos.com`, `demo.warehouse2@pos.com`, mật khẩu lấy từ `SEED_PASSWORD` tại lần tạo.

Seed demo chạy trong một transaction. Tồn kho xuất phát từ phiếu nhập và được cập nhật theo bán hàng/lắp combo/hoàn trả/kiểm kê; điểm có lịch sử tích/đổi/hoàn; không gọi ngân hàng hoặc phát thông báo realtime cho các giao dịch mẫu. Không xóa hoặc cập nhật lại dữ liệu có sẵn. Collection `seedRuns` ghi nhận batch `localstore-demo-v1`: chạy lại lệnh sẽ báo đã tồn tại và không bổ sung tồn kho, cộng lại điểm hay đổi mật khẩu. Đây là bộ dữ liệu demo một lần, không tự dịch lịch sang ngày mới khi chạy lại.

Đã kiểm chứng ngày 02/11/2026: `npm run check` pass (184 file), `npm test` pass 23/23. Bộ test seed riêng kiểm tra rollback toàn lô khi lỗi, đối chiếu lịch sử tồn/tiền/điểm/voucher và chạy lại an toàn; đồng thời giữ sản phẩm và mật khẩu có sẵn. Sau khi nạp vào local 27018, đăng nhập quản lý và 8 endpoint đọc sản phẩm/POS/khách hàng/hóa đơn/dashboard/khuyến mãi/nhập hàng/hoàn trả đều trả HTTP 200.

Server chỉ listen sau khi kết nối, xác minh replica set và tạo xong index. MongoDB standalone không hỗ trợ transaction của POS; dùng compose đi kèm hoặc replica set hiện có. Các biến SQL `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME` không còn được runtime sử dụng. Tệp `.env` thật không bị sửa.

Nếu gặp lỗi pipe `dockerDesktopLinuxEngine`, mở Docker Desktop và chờ Linux engine sẵn sàng (`docker info` phải trả thông tin server). Nếu cổng 27017 đã được MongoDB khác sử dụng, giữ nguyên database đó và chạy replica set của dự án ở cổng khác:

```powershell
$env:MONGODB_PORT = '27018'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27018/localstore_pos?replicaSet=rs0&directConnection=true'
docker compose up -d --wait
```

Hai biến trên chỉ áp dụng cho terminal hiện tại; có thể lưu cùng giá trị vào `.env` local để dùng cho các lần chạy sau.

```powershell
npm run check
npm test
```

`check` kiểm tra cú pháp, nạp routes và chặn import model/database từ service/controller/middleware. Repository nhận session tường minh hoặc dùng session hiện hành từ `AsyncLocalStorage`. `npm test` khởi tạo MongoDB 7.0.14 replica set tạm, khởi chạy HTTP server trên cổng trống và gọi endpoint thật. Không kết nối database trong `.env`; URI test được truyền trực tiếp. Lần đầu cần Internet tải binary MongoDB (~592 MB trên Windows); binary được cache ở `.cache/mongodb/`. Cần môi trường cho phép chạy mongod và mở socket localhost. Nếu Windows tạm khóa archive sau khi tải/giải nén, chạy lại lệnh test khi khóa được giải phóng. Không cần Docker để chạy bộ test này.

Các file `test_login_*.js`, `test_trigger.js`, `check_*.js` cũ chỉ chứa code đã comment; chúng không phải bộ test thực thi. Trước thay đổi, `npm test` chỉ báo “no test specified”; dự án không có cấu hình lint.

## Chuyển dữ liệu hiện hữu

Chuyển code không tự chuyển dữ liệu SQL. Không có kết nối SQL Server/production nào được thực hiện trong lần triển khai này. `src/config/script.sql` được giữ làm tài liệu đối chiếu, không được chạy bởi ứng dụng hay seed mới.

Xuất dữ liệu SQL bằng công cụ riêng thành JSON UTF-8:

```json
{
  "schemaVersion": 1,
  "tables": {
    "Customers": [
      { "id": 42, "name": "Khách lịch sử", "phone": "0901234567", "loyaltyPoints": 7, "totalSpending": "12345.67", "status": "Active", "createdAt": "2025-01-02T03:04:05", "updatedAt": "2025-01-02T03:04:05" }
    ]
  }
}
```

Các tên bảng hỗ trợ được khai báo trong `src/repositories/migration.repository.js`. Decimal nên xuất thành chuỗi để tránh mất chữ số khi xuất SQL; ID phải nằm trong miền integer an toàn của JavaScript. Datetime SQL không có múi giờ được diễn giải là giờ Việt Nam; datetime có offset được giữ đúng thời điểm. TIME được lưu HH:mm, DATE lịch làm việc được lưu YYYY-MM-DD.

```powershell
# Chọn URI database đích local/staging trước khi chạy, không dùng URI production.
npm run migrate:json -- D:\exports\localstore.json
```

Import giữ ID, kiểm tra schema và toàn bộ reference trong cùng transaction; lỗi làm rollback cả lô. Chạy lại giữ nguyên bản ghi trùng nội dung; gặp cùng ID nhưng khác dữ liệu sẽ dừng, không ghi đè dữ liệu đang hoạt động. Sequence được nâng bằng `$max` của ID nhập, còn cấp ID mới luôn dùng `$inc` nguyên tử. FK chưa có trong export phải tồn tại ở database đích. Các computed column `CashHandovers.difference`, `PurchaseOrderItems.total/receivedTotal` được tính lại từ thành phần. Với export lớn, chia lô theo quan hệ và kiểm tra giới hạn thời gian transaction của MongoDB; công cụ hiện không tự streaming/chia lô.

Nên import vào database trống trước khi chạy seed để các ID SQL của role/user/staff/counter được giữ nguyên. Chuẩn hóa trường unique tùy chọn `barcode`, `email`, `txnRef`, `transactionId` rỗng thành null. Giữ nguyên trạng thái hoa/thường thực tế: `Approve`/`Reject` của hoàn trả, `Approved` của nhập lại kho/kiểm kê, `SUCCESS` của payment.

## Thiết kế và kiểm chứng

Xem [bảng ánh xạ, bản đồ module và khác biệt cần lưu ý](docs/mongodb-migration.md).

Ví dụ thanh toán tiền mặt:

1. `src/controllers/payment.controller.js::payCash` nhận request, giữ response/status hiện có.
2. `src/services/payment.service.js::payCash` mở `runInTransaction`, kiểm tra hóa đơn/giảm giá, điều phối payment, kho và điểm.
3. `src/repositories/invoice.repository.js::getInvoiceById` ghi `_revision` khi cần khóa hóa đơn; `src/repositories/productStock.repository.js::decreaseStockIfAvailable` trừ tồn bằng filter có điều kiện.
4. `src/models/invoice.model.js` (`Invoice`), `src/models/productStock.model.js` (`InventoryStock`) và các schema payment/customer/log lưu dữ liệu trong cùng session.
5. `src/infrastructure/transaction.js::afterCommit` chỉ phát socket/SSE sau khi commit; callback transaction bị retry không phát thêm sự kiện.

Tài liệu kỹ thuật đối chiếu: [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), [Mongoose validation](https://mongoosejs.com/docs/validation.html), [MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/).
