// Purchase order statuses (UPPERCASE as stored in SQL Server) with a consistent colour per status.
export const STATUS_META = Object.freeze({
  PENDING: { label: 'Chờ duyệt', bg: 'warning', text: 'dark', icon: 'bi-hourglass-split' },
  APPROVED: { label: 'Đã duyệt', bg: 'success', text: 'white', icon: 'bi-check-circle' },
  RECEIVED: { label: 'Đã nhận hàng', bg: 'primary', text: 'white', icon: 'bi-box-seam' },
  CANCELED: { label: 'Đã hủy', bg: 'danger', text: 'white', icon: 'bi-x-circle' },
})

export const STATUS_OPTIONS = Object.keys(STATUS_META)

export const statusMeta = (status) => STATUS_META[status] || { label: status || '—', bg: 'secondary', text: 'white', icon: 'bi-question-circle' }

export const TIMELINE_LABELS = Object.freeze({
  CREATED: 'Tạo đơn',
  APPROVED: 'Duyệt đơn',
  RECEIVED: 'Nhận hàng',
  CANCELED: 'Hủy đơn',
})
