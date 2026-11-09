// Maps backend error codes (docs/work/API-EXAMPLES.md) and transport failures to Vietnamese messages.
// Raw backend text, SQL errors and stack traces are never shown.
const BY_CODE = {
  INVALID_CREDENTIALS: 'Sai tên đăng nhập hoặc mật khẩu.',
  VALIDATION_ERROR: 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại.',
  EMPTY_ITEMS: 'Đơn mua hàng cần có ít nhất một sản phẩm.',
  INVALID_QUANTITY: 'Số lượng phải là số nguyên dương.',
  DUPLICATE_VARIANT: 'Có sản phẩm bị trùng trong đơn.',
  TOO_MANY_ITEMS: 'Một đơn mua hàng có tối đa 200 dòng.',
  INVALID_ID: 'Mã không hợp lệ.',
  INVALID_STATUS: 'Trạng thái lọc không hợp lệ.',
  INVALID_DATE: 'Ngày không hợp lệ.',
  INVALID_DATE_RANGE: 'Khoảng ngày không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.',
  INVALID_SORT: 'Cách sắp xếp không hợp lệ.',
  REASON_REQUIRED: 'Vui lòng nhập lý do hủy đơn.',
  REASON_TOO_LONG: 'Lý do hủy tối đa 500 ký tự.',
  INVALID_JSON: 'Yêu cầu không hợp lệ.',
  INVALID_IDEMPOTENCY_KEY: 'Khóa chống tạo trùng không hợp lệ. Vui lòng thử lại.',
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không đủ quyền thực hiện thao tác này.',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị.',
  STAFF_NOT_FOUND: 'Tài khoản chưa được liên kết với nhân viên.',
  STAFF_RESIGNED: 'Nhân viên đã nghỉ việc, không thể sử dụng hệ thống.',
  PO_NOT_FOUND: 'Không tìm thấy đơn mua hàng.',
  SUPPLIER_NOT_FOUND: 'Không tìm thấy nhà cung cấp.',
  ROUTE_NOT_FOUND: 'Chức năng không tồn tại trên máy chủ.',
  PO_INVALID_STATUS: 'Trạng thái đơn không còn hợp lệ cho thao tác này (có thể đã được người khác xử lý).',
  GOODS_RECEIPT_EXISTS: 'Đơn đã có phiếu nhận hàng nên không thể hủy.',
  CONCURRENT_UPDATE: 'Đơn đang được xử lý bởi người khác. Vui lòng thử lại sau ít giây.',
  IDEMPOTENCY_KEY_REUSED: 'Yêu cầu này trùng khóa với một yêu cầu khác có nội dung khác. Vui lòng thử tạo lại.',
  SUPPLIER_INACTIVE: 'Nhà cung cấp đã ngừng hoạt động.',
  SUPPLIER_NO_MAPPED_PRODUCTS: 'Nhà cung cấp chưa có sản phẩm nào để đặt hàng.',
  VARIANT_NOT_FOUND: 'Có sản phẩm không tồn tại.',
  VARIANT_NOT_SUPPLIED: 'Có sản phẩm không thuộc nhà cung cấp đã chọn.',
  PRODUCT_INACTIVE: 'Có sản phẩm đã ngừng bán.',
  PRICE_NOT_CONFIGURED: 'Có sản phẩm chưa có giá mua hợp lệ.',
  VALUE_OUT_OF_RANGE: 'Giá trị tính toán vượt quá giới hạn cho phép.',
  DUPLICATE_RECORD: 'Dữ liệu bị trùng với bản ghi đã có.',
  CONSTRAINT_VIOLATION: 'Dữ liệu vi phạm ràng buộc của hệ thống.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn.',
  DB_ERROR: 'Máy chủ gặp lỗi cơ sở dữ liệu. Vui lòng thử lại sau.',
  DB_NOT_CONNECTED: 'Máy chủ chưa kết nối được cơ sở dữ liệu.',
  CONFIG_ERROR: 'Máy chủ chưa được cấu hình đầy đủ.',
  COMMIT_OUTCOME_UNKNOWN: 'Chưa xác định được thao tác đã được lưu hay chưa. Vui lòng kiểm tra lại dữ liệu trước khi thử lại.',
  INTERNAL_ERROR: 'Máy chủ gặp lỗi không mong muốn. Vui lòng thử lại sau.',
}

const BY_STATUS = {
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  403: 'Bạn không đủ quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu yêu cầu.',
  409: 'Dữ liệu đã thay đổi hoặc xung đột. Vui lòng tải lại và thử lại.',
  422: 'Dữ liệu không thỏa điều kiện nghiệp vụ.',
}

export const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng kiểm tra backend đang chạy và thử lại.'
export const TIMEOUT_MESSAGE = 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
export const FALLBACK_MESSAGE = 'Đã xảy ra lỗi. Vui lòng thử lại.'

/** @param {{status?: number, code?: string, isNetwork?: boolean, isTimeout?: boolean}} err normalized ApiError */
export const getErrorMessage = (err) => {
  if (!err) return FALLBACK_MESSAGE
  if (err.isTimeout) return TIMEOUT_MESSAGE
  if (err.isNetwork) return NETWORK_MESSAGE
  if (err.code && BY_CODE[err.code]) return BY_CODE[err.code]
  if (err.status && BY_STATUS[err.status]) return BY_STATUS[err.status]
  if (err.status >= 500) return BY_CODE.INTERNAL_ERROR
  return FALLBACK_MESSAGE
}

/**
 * True when a failed WRITE may or may not have been applied by the server (no definite answer):
 * network failure, timeout, COMMIT_OUTCOME_UNKNOWN, or a bare 5xx.
 */
export const isOutcomeUnknown = (err) => Boolean(err && (err.isNetwork || err.isTimeout || err.code === 'COMMIT_OUTCOME_UNKNOWN'))
export const isCommitUnknown = (err) => Boolean(err && err.code === 'COMMIT_OUTCOME_UNKNOWN')
