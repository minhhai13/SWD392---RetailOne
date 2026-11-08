# Bản đồ chuyển SQL Server → MongoDB

## Cấu trúc đã đọc trước khi sửa

Entry point `src/index.js` tạo Express, HTTP server và Socket.IO; routes nằm ở `src/routes`, controller ở `src/controllers`, service ở `src/services`. CommonJS và npm được giữ. Trước chuyển đổi, mọi file `*.model.js` chứa hàm SQL thay vì mô tả dữ liệu; `invoiceItem`/`vnpay` còn có hàm ghi chỉ là stub. SQL nằm thêm trong `category.service`, `dashboard.service`, helper transaction của invoice/payment/return/điểm/restock và middleware auth thông qua model. Không thấy validator directory, job, stored procedure hay test đang chạy. Các script chẩn đoán/test ở gốc backend đều đã comment.

Đã đối chiếu `src/config/script.sql`: 37 bảng khác nhau, có đoạn CREATE WorkSchedules lặp và ALTER xóa các cột cũ. Có FK/default/enum/computed column; không có định nghĩa CREATE TRIGGER/PROCEDURE. Vì vậy không thể chứng minh parity với trigger/procedure chỉ tồn tại trên một SQL Server ngoài source.

## Ánh xạ dữ liệu

Mỗi bảng giữ collection riêng, không embed dòng hóa đơn. `_id` nội bộ không lộ API; `id` số có unique index, cấp qua `sequences` với `$inc` trong transaction. Bảng khóa ghép giữ khóa ghép. Reference lưu ID công khai, repository JOIN bằng trường `id`, không populate theo `_id`.

| SQL Server | Collection MongoDB | Khóa/quan hệ | Index quan trọng |
| --- | --- | --- | --- |
| Products, ProductUnits, ProductCombos | products, productUnits, productCombos | ID số; unit/combo tham chiếu product | code unique CI; barcode unique partial CI; productId+unitName unique; một base unit/product; parent+child unique |
| Categories, InventoryStocks | categories, inventoryStocks | parentId tự tham chiếu; stock có khóa productId | parentId; productId unique |
| ProductSalePriceHistories | productSalePriceHistories | ID số; product/unit/staff | productId, productUnitId, changedAt+id |
| Customers, CustomerPointLogs, CustomerVoucherUsage | customers, customerPointLogs, customerVoucherUsage | ID số; customer/invoice/voucher | phone unique partial; customerId; invoiceId; voucherId |
| Promotions, PromotionProducts, Vouchers | promotions, promotionProducts, vouchers | ID số; đối tượng áp dụng giữ reference riêng | voucher code unique CI; promotion/product/category/unit FK indexes |
| Invoices, InvoiceItems, Payments | invoices, invoiceItems, payments | ID số cho hóa đơn và từng dòng; payment theo invoice | invoiceCode unique; invoiceId trên items; payment.invoiceId unique; transactionId unique partial |
| Returns, ReturnItems | returns, returnItems | giữ invoiceItemId ổn định và snapshot hàng/đơn vị | invoiceId, returnId, invoiceItemId, productId |
| Suppliers, ProductSuppliers, SupplierProductPrices | suppliers, productSuppliers, supplierProductPrices | ID số; product+supplier là khóa ghép; giá theo unit | productId+supplierId unique; supplierId, unitId |
| PurchaseOrders, PurchaseOrderItems | purchaseOrders, purchaseOrderItems | ID số; po/unit/staff/supplier | poId; productUnitId; supplierId |
| InventoryAdjustments, InventoryAdjustmentItems, ProblematicGoodsReport | inventoryAdjustments, inventoryAdjustmentItems, problematicGoodsReport | ID số; adjustment/product/staff | adjustmentId, productId, reportedBy |
| Users, Roles, Features, RoleFeatures, Staff | users, roles, features, roleFeatures, staff | ID số; role/user/staff; khóa roleId+featureId | username/role name/feature key unique CI; phone/email unique partial; role+feature unique |
| Shifts, WorkSchedules, CashHandovers, Payrolls | shifts, workSchedules, cashHandovers, payrolls | ID số; staff/shift/schedule | staff+shift+workDate unique; scheduleId unique; staff+month+year unique |
| Counters, LabelPrintQueue, VnPayTransactions | counters, labelPrintQueue, vnPayTransactions | ID số; quầy/product/invoice | counterCode unique; txnRef unique partial; invoiceId |

Mọi trường decimal SQL được lưu Decimal128 với scale 2 hoặc 3; quantity dòng hóa đơn/hoàn trả và conversionFactor dùng 3 chữ số theo các tham số Decimal trong truy vấn hiện có (DDL cũ còn ghi int). Repository chuyển về JSON number; ID/decimal vượt miền biểu diễn an toàn của API bị từ chối. Làm tròn thập phân theo base 10, có test ranh giới 1.005 → 1.01. Thời gian lưu UTC, các báo cáo/ca làm dùng ngày Việt Nam; TIME trả HH:mm hoặc Date 1970 cho service vốn nhận SQL TIME dạng Date.

Snapshot `InvoiceItems.productName/unitName/unitPrice/baseQuantity/lineTotal` được giữ; chi tiết hóa đơn dùng snapshot, kể cả sau khi sửa catalog. ReturnItems giữ ID dòng gốc và snapshot, không tái định giá từ giá sản phẩm hiện tại. Hệ số lịch sử được suy từ baseQuantity/quantity.

Index unique tùy chọn bỏ qua null/missing. Trường rỗng barcode/email/transaction được chuẩn hóa khi nhập/tạo; khác với SQL Server UNIQUE thông thường chỉ cho một NULL, Mongo cho nhiều giá trị bỏ trống. Dữ liệu có barcode trùng hoặc nhiều base unit sẽ khiến tạo index thất bại trước khi server listen; cần làm sạch export, không tự gộp/xóa. Ràng buộc một base unit, tên unit, barcode và combo được khôi phục theo các tên constraint mà service SQL cũ xử lý, dù DDL đính kèm chưa khai báo đủ các index này.

## Một luồng cho từng nhóm module

Tên dưới đây là hàm thực thi trong các file cùng tên tại `src/controllers`, `src/services`, `src/repositories`; model mới chỉ định nghĩa schema, không chứa hàm truy vấn.

| Endpoint/nhóm | Controller → service → repository | Mongoose model chính |
| --- | --- | --- |
| POST /api/auth/login | auth.login → auth.login → user.findByUsername | User, Role, RoleFeature, Feature |
| GET /api/users | user.getAllUser → user.getAllUser → user.getAllUser | User |
| Categories | category.getCategoryTree → category.getCategoryTree → category.getRootCategories/getAllDescendants | Category, Product |
| Sản phẩm | product.getProductById → product.getProductDetail → product/product.getProductDetail | Product, ProductUnit, InventoryStock |
| Barcode | product.getBarcodeProducts → product.getBarcodeProducts → product/product.getBarcodeProducts | ProductUnit, Product |
| Đơn vị | productUnit.create → product/productUnit.create → product/productUnit.create | ProductUnit, PriceHistory |
| Combo | productCombo.assembleCombo → product/productCombo.assembleCombo → product/productCombo.getComboItems + productStock.decreaseStockIfAvailable/addStock | ProductCombo, InventoryStock |
| Lịch sử giá | priceHistory.getAllByProductId → product/priceHistory.getAllByProductId → product/priceHistory.getAllSaleByProductId | PriceHistory |
| Khách hàng | customer.getCustomerByPhone → customer.getCustomerByPhone → customer.getCustomerByPhone | Customer |
| Điểm | customer.adjustPoints → customerPointLog.manualAdjustPoints/adjustPoints → customer.updateCustomerPoints + customerPointLog.insertPointLog | Customer, CustomerPointLog |
| Khuyến mãi | promotion.getProductDiscount → promotion.getDiscountByProduct → promotion.getDiscountByProduct | Promotion, PromotionProduct |
| Voucher | voucher.validateVoucher → voucher.validateVoucher → voucher.getVoucherByCode | Voucher |
| Hóa đơn nháp | invoice.createInvoice → invoice.createInvoice → invoice.insertInvoice/insertInvoiceItem | Invoice, InvoiceItem |
| Thanh toán | payment.payCash → payment.payCash → invoice.insertPayment + productStock.decreaseStockIfAvailable | Payment, InventoryStock |
| Webhook | payment.webhook → payment.confirmPayment → payment.findByTransactionId/updatePaymentStatus | Payment, Invoice |
| Hoàn trả | return.createReturn → return.createReturn → return.createReturn + returnItem.createReturnItem | Return, ReturnItem |
| Nhập lại kho | returnItem.approveRestock → returnItem.approveRestock → returnItem.updateRestockStatus + productStock.addStock | ReturnItem, InventoryStock |
| Kho theo danh mục | inventory.getProductStockByCategory → InventoryServices/inventory.getProductStockByCategory → productStock.getProductsByCategory | Product, InventoryStock |
| Tổng kho danh mục | inventory.getCategoryStock → InventoryServices/inventory.getCategoryStock → categoryStock.getCategoryStock | Category, Product, InventoryStock |
| Nhà cung cấp | supplier.getSupplierProducts → InventoryServices/supplier.getProductsBySupplier → supplier.getProductsBySupplier | ProductSupplier, SupplierProductPrice |
| Nhập hàng | purchaseOrder.receiveOrder → InventoryServices/purchaseOrder.receiveOrder → purchaseOrder.receiveOrder | PurchaseOrderItem, InventoryStock, PurchaseOrder |
| Kiểm kê | adjust.updateStatus → InventoryServices/adjust.updateStatus → adjust.updateStatusTransaction | Adjustment, AdjustmentItem, InventoryStock |
| Báo hàng lỗi | inventory.createProblematicReport → InventoryServices/problematic.createReport → problematic.create | Problematic |
| Báo cáo nhập | poReport.getMonthlyReport → InventoryServices/report.getMonthlyReport → poReport.getMonthlyReport | PurchaseOrder, PurchaseOrderItem |
| Nhân viên | staff.createStaff → staff.createStaff → staff.create | User, Staff |
| Ca làm | shift.createShift → shift.createShift → shift.createShift | Shift |
| Lịch làm | roster.assignShift → roster.assignShift → roster.assignShift | WorkSchedule |
| Chấm công | attendance.checkIn → attendance.checkIn → attendance.processCheckIn | WorkSchedule, CashHandover |
| Bàn giao | cashier.submitHandover → cashier.submitHandover → cashier.createHandoverSimple | CashHandover, WorkSchedule |
| Lương | salary.confirmPayroll → salary.confirmPayroll → salary.savePayroll | Payroll |
| Dashboard | dashboard.getSummary → dashboard.getSummary → dashboard.getSummary | Invoice, Return, Payment, các nhóm thống kê |

SSE, Socket.IO, upload không đọc SQL; routes và tích hợp được giữ. Helper `runInTransaction` quản lý begin/commit/rollback/retry/session. Service chọn phạm vi transaction; repository nhận cùng session, trả dữ liệu plain hoặc kết quả ghi đã thực thi. Việc đọc/ghi phụ thuộc nhau trong transaction chạy tuần tự.

## Ranh giới transaction và parity

- Tạo/sửa sản phẩm: product + base unit + lịch sử giá + stock; tạo/sửa staff: user + staff; combo: trừ hàng con + cộng hàng cha.
- Tạo/sửa invoice: header + items + amounts; không giảm tồn. Sửa/checkout/hoàn trả khóa cùng invoice bằng tăng `_revision` trong session để thay UPDLOCK.
- Thanh toán: payment + giảm tồn có điều kiện + invoice status + voucher usage + điểm/log. Webhook đọc mã giao dịch và dùng unique index; request lặp không ghi payment/kho/điểm hoặc phát sự kiện lần hai. QR chỉ lưu ý định thanh toán/discount; tác động kho/điểm/voucher chỉ khi thành công.
- PO: nhiều đơn theo supplier và items cùng commit; nhận hàng kiểm tra số còn lại, tăng tồn và tổng nhận cùng commit. Kiểm kê, hoàn trả/phê duyệt/nhập lại kho, chấm công/bàn giao và chốt lương đều có transaction.
- Foreign key kiểm tra trong repository; API xóa sản phẩm/khách hàng/danh mục/promotion/voucher dùng soft delete. Xóa unit đang được tham chiếu bị chặn. Duplicate key chuyển sang các nhánh lỗi nghiệp vụ sẵn có.
- JOIN/SUM/count được triển khai trong repository; dùng null cho LEFT JOIN và tie-break ID để sắp xếp ổn định. Báo cáo PO giữ cách tính AVG theo số dòng join như SQL cũ. Các báo cáo lớn hiện có thể phát sinh nhiều truy vấn; chưa benchmark với dữ liệu production.

## Các điểm khác biệt và phần chưa thể xác minh

Các sửa cần thiết để bảo đảm tính nhất quán sau chuyển đổi: truy vấn invoice không còn giấu PAID (webhook lặp trước đây không đọc được nó); mã giao dịch được lưu thật; QR lưu finalAmount sau discount; chuyển từ QR sang cash cập nhật cả method/amount; hóa đơn đã trả tiền không sửa items; socket/SSE chỉ sau commit; hóa đơn lịch sử giữ snapshot; hoàn trả nhận đúng `Approve` khi tính tổng, tránh đếm lại dòng đang duyệt và trùng invoiceItemId; ID nhân viên lấy staffId, không giả định userId bằng staffId; nhận PO tính trạng thái trên toàn bộ dòng và chống nhận vượt khi cạnh tranh.

Giữ các hành vi cũ còn mâu thuẫn để không tự đổi nghiệp vụ ngoài migration:

- Công thức tạo invoice có promotion hiện giảm giá trên unitPrice rồi tiếp tục trừ totalDiscount khỏi finalAmount. Chưa đổi công thức giá này; cần chủ dự án xác nhận trước khi sửa riêng.
- Dashboard vẫn tính doanh thu mọi invoice trừ CANCELLED (bao gồm nháp), và nhánh bank_transfer vẫn dùng nhãn BANK như SQL cũ. Payment hiện dùng BANK_TRANSFER nên số chuyển khoản dashboard có thể vẫn bằng 0.
- Route PATCH `/api/returns/:id/restock` đã tồn tại nhưng service `restockReturn` vốn thiếu trước chuyển đổi; frontend thực tế dùng `/api/return-items/restock/:id/approve|reject`, đã được kiểm thử. Không suy đoán thêm nghiệp vụ cho route cũ còn thiếu này.
- Không thấy định nghĩa trigger/procedure SQL, không có SQL database baseline để chạy cùng một dataset so sánh trực tiếp hai engine. Test hiện xác minh kỳ vọng JOIN/SUM/snapshot/transaction theo source và các fixture kiểm soát, không khẳng định đã đối chiếu production.
- Docker Compose đã được xác minh sau khi khởi động Docker Desktop: MongoDB 7.0 healthy, replica set rs0 có primary, cổng host 27018 vì MongoDB standalone hiện có chiếm cổng 27017. Bộ integration chạy mongod 7.0.14 replica set tạm. QR URL và webhook được kiểm tra nội bộ; chưa có giao dịch ngân hàng/SePay thật hay trình duyệt frontend kết nối SSE/socket trực tiếp.

Không thay đổi frontend; không ghi đè secret thật; không tự chạy migration trên database thật.

## Kết quả kiểm tra ngày 02/11/2026

- `npm run check`: pass, 178 file JavaScript; kiểm tra cú pháp, nạp module/routes và ranh giới layer.
- `npm test`: 20/20 pass, 0 fail/skip; lượt cuối khoảng 12,7 giây sau khi binary đã được cache.
- 40 endpoint đọc được gọi thật; kiểm tra response/status và không lộ `_id`, `__v`, `$numberDecimal`.
- Đã xác minh qua HTTP và trạng thái database: barcode, hóa đơn nháp, cash + điểm, thiếu tồn, cạnh tranh tồn cuối, webhook đồng thời/lặp, voucher + đổi điểm, lỗi sau khi ghi status/kho/payment/điểm rồi rollback, giữ snapshot, hoàn trả và nhập lại đồng thời, seed/import chạy lại, nhập hàng đồng thời, kiểm kê, combo, chấm công, bàn giao và lương, lượt voucher cuối, reference sai và mã unique không phân biệt hoa/thường.
- Scan runtime: không còn import mssql, truy vấn SQL, service/controller/middleware import model/database trực tiếp. Mssql đã được gỡ khỏi package và lockfile. Không route nào thay đổi so với source lúc bắt đầu.
- `git diff --check` cho phần backend ngoại trừ SSE: pass. Full diff vẫn báo hai dòng whitespace có sẵn trong thay đổi `sse.service.js` của workspace; file này được giữ nguyên chính xác.
