const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const EMPTY = '—'

// DECIMAL(18,2) amounts: show up to 2 decimals so e.g. 31500.5 is never silently rounded.
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })
const dateTime = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const dateOnly = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })

const isMissing = (v) => v === null || v === undefined || v === ''

export const formatVnd = (value) => {
  if (isMissing(value) || Number.isNaN(Number(value))) return EMPTY
  return money.format(Number(value))
}

export const formatQuantity = (value) => (isMissing(value) || Number.isNaN(Number(value)) ? EMPTY : integer.format(Number(value)))

const toDate = (value) => {
  if (isMissing(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export const formatDateTime = (value) => {
  const d = toDate(value)
  return d ? dateTime.format(d) : EMPTY
}

export const formatDate = (value) => {
  const d = toDate(value)
  return d ? dateOnly.format(d) : EMPTY
}

export const orDash = (value) => (isMissing(value) ? EMPTY : value)

/** Staff reference object { staffId, fullName } | null -> display name. */
export const formatStaff = (staff) => (staff && staff.fullName ? staff.fullName : EMPTY)
