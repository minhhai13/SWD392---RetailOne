# API EXAMPLES (curl) — UC22–UC26

Không có frontend; dùng curl hoặc import `docs/work/postman/RetailOne-PO.postman_collection.json` vào Postman.
Mật khẩu **không** nằm trong tài liệu: tạo tài khoản mẫu bằng `npm run db:seed-dev` (đặt `SEED_MANAGER_PASSWORD`, `SEED_WAREHOUSE_PASSWORD`, `SEED_CASHIER_PASSWORD` hoặc để script sinh ngẫu nhiên và in ra terminal của bạn).

```bash
B=http://localhost:5000/api
# đăng nhập (đặt MANAGER_PASSWORD / WAREHOUSE_PASSWORD trong shell của bạn, không ghi vào file)
MG=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"manager\",\"password\":\"$MANAGER_PASSWORD\"}" | jq -r .data.token)
WH=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"warehouse\",\"password\":\"$WAREHOUSE_PASSWORD\"}" | jq -r .data.token)
```

| Bước | Lệnh |
|---|---|
| Supplier Active (UC22 b2) | `curl -s $B/inventory/suppliers -H "Authorization: Bearer $WH"` |
| Catalog + giá mua mới nhất (UC22 b4) | `curl -s $B/inventory/suppliers/1/products -H "Authorization: Bearer $WH"` |
| **UC22.1** supplier cho danh sách low-stock | `curl -s "$B/inventory/suppliers/by-variants?variantIds=10,11,12" -H "Authorization: Bearer $WH"` |
| **UC22** tạo PO | `curl -s -X POST $B/inventory/purchase-orders -H "Authorization: Bearer $WH" -H 'Content-Type: application/json' -d '{"supplierId":1,"note":"ghi chú","items":[{"variantId":10,"quantity":2},{"variantId":11,"quantity":3,"note":"gấp"}]}'` |
| **UC23** danh sách | `curl -s "$B/inventory/purchase-orders?status=PENDING&from=2026-01-01&to=2026-12-31&q=PO-&sortBy=totalAmount&sortDir=desc&page=1&pageSize=20" -H "Authorization: Bearer $WH"` |
| **UC24** chi tiết | `curl -s $B/inventory/purchase-orders/1 -H "Authorization: Bearer $WH"` |
| **UC25** duyệt (Manager) | `curl -s -X PATCH $B/inventory/purchase-orders/1/approve -H "Authorization: Bearer $MG"` |
| **UC26** hủy (Manager) | `curl -s -X PATCH $B/inventory/purchase-orders/1/cancel -H "Authorization: Bearer $MG" -H 'Content-Type: application/json' -d '{"reason":"Nhà cung cấp không giao được hàng"}'` |

### Retry an toàn khi tạo PO
```bash
K="po-$(date +%s)-retry"   # 8-128 ký tự [A-Za-z0-9_-]
curl -s -i -X POST $B/inventory/purchase-orders -H "Authorization: Bearer $WH" -H "Idempotency-Key: $K" -H 'Content-Type: application/json' -d '{"supplierId":1,"items":[{"variantId":10,"quantity":2}]}'
# gửi lại y hệt -> 200 + "Idempotent-Replay: true" + cùng PO (lần đầu: 201)
```

## Quy ước response
Thành công: `{ "success": true, "data": …, "message"?: "…" }`
Lỗi: `{ "success": false, "code": "…", "message": "…", "details"?: {…} }`

| HTTP | `code` tiêu biểu |
|---|---|
| 400 | `INVALID_IDEMPOTENCY_KEY`, `VALIDATION_ERROR`, `EMPTY_ITEMS`, `INVALID_QUANTITY`, `DUPLICATE_VARIANT`, `TOO_MANY_ITEMS`, `INVALID_ID`, `INVALID_STATUS`, `INVALID_DATE`, `INVALID_DATE_RANGE`, `INVALID_SORT`, `REASON_REQUIRED`, `REASON_TOO_LONG`, `INVALID_JSON` |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (sai role), `ACCOUNT_LOCKED`, `STAFF_NOT_FOUND`, `STAFF_RESIGNED` |
| 404 | `PO_NOT_FOUND`, `SUPPLIER_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | `IDEMPOTENCY_KEY_REUSED`, `PO_INVALID_STATUS` (`details.currentStatus`), `GOODS_RECEIPT_EXISTS`, `CONCURRENT_UPDATE` |
| 422 | `SUPPLIER_INACTIVE`, `SUPPLIER_NO_MAPPED_PRODUCTS`, `VARIANT_NOT_FOUND`, `VARIANT_NOT_SUPPLIED`, `PRODUCT_INACTIVE`, `PRICE_NOT_CONFIGURED`, `VALUE_OUT_OF_RANGE` |
| 500 | `COMMIT_OUTCOME_UNKNOWN`, `DB_ERROR`, `INTERNAL_ERROR` (thông điệp luôn an toàn, không lộ chi tiết DB) |

## Dữ liệu trả về (rút gọn)
- Detail PO: `id, poCode, status, note, supplier{id,name,taxId,phoneNumber,address} (snapshot), totalAmount, createdBy/approvedBy/canceledBy {staffId, fullName}, createdAt/approvedAt/canceledAt, cancelReason, items[{id,variantId,productId,productCode,productName,unitName,conversionFactor,quantity,costPrice,total,receivedQuantity,note}], timeline[{event,at,by,reason?}], availableActions[APPROVE|CANCEL]`.
- List: `data.items[{id,poCode,createdAt,supplierId,supplierName,createdBy,createdByName,totalAmount,status,itemCount}]`, `data.pagination{page,pageSize,total,totalPages}`; rỗng → 200 + `message: "No matching purchase orders found"`.
- `timeline` chỉ suy ra từ các cột thời gian, không phải audit log (OPEN-QUESTIONS Q3).
- Login / `GET /auth/me`: `data.user = { id, username, staffId, fullName, role: { name }, permissions: ["VIEW_PURCHASE_ORDER", ...], requirePasswordChange }`. Frontend dùng `permissions` để hiện/ẩn nút; backend vẫn kiểm tra thật (403).
- UC22.1 `GET /inventory/suppliers/by-variants`: `data = { selectedVariants[{variantId, productId, productCode, productName, unitName, productStatus, stock{quantityOnHand,minThreshold}|null}], unknownVariantIds[], inactiveVariantIds[], suppliers[{id,name,taxId,phoneNumber,address,status,coversAll,coveredVariantIds[],missingVariantIds[],items[{variantId,supplyPrice}]}] }`; không có supplier → `suppliers: []` + `message: "No active supplier provides the selected products."`.
- Ghi thành công nhưng đọc lại lỗi: `201/200` với `data` tối giản (`{id, poCode, status, supplier}` / `{id, status}` / `{id, status, cancelReason}`) và `meta: { detailLoaded: false }` → gọi `GET /purchase-orders/:id`.
