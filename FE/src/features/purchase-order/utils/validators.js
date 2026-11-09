// Client-side checks that mirror the backend validators (the backend remains the source of truth).
export const LIMITS = Object.freeze({
  MAX_QUANTITY: 999999999999,
  MAX_ITEMS: 200,
  MAX_ITEM_NOTE: 500,
  MAX_PO_NOTE: 2000,
  MAX_CANCEL_REASON: 500,
  MAX_SEARCH: 100,
})

/** UC22.0.E1: quantity must be a positive whole number. Returns an error message or null. */
export const validateQuantity = (value) => {
  const text = String(value ?? '').trim()
  if (text === '') return 'Vui lòng nhập số lượng.'
  if (!/^\d+$/.test(text)) return 'Số lượng phải là số nguyên dương.'
  const n = Number(text)
  if (n < 1) return 'Số lượng phải lớn hơn 0.'
  if (n > LIMITS.MAX_QUANTITY) return 'Số lượng quá lớn.'
  return null
}

export const validateNote = (value, max, label = 'Ghi chú') => (String(value ?? '').length > max ? `${label} tối đa ${max} ký tự.` : null)

/** UC26.0.E2: reason is required (after trim) and at most 500 characters. */
export const validateCancelReason = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return 'Vui lòng nhập lý do hủy đơn.'
  if (text.length > LIMITS.MAX_CANCEL_REASON) return `Lý do tối đa ${LIMITS.MAX_CANCEL_REASON} ký tự.`
  return null
}

/** UC23.1: a valid date range has from <= to (YYYY-MM-DD strings compare lexicographically). */
export const validateDateRange = (from, to) => (from && to && from > to ? 'Ngày bắt đầu không được sau ngày kết thúc.' : null)

/**
 * Validates a UC22 draft: { supplierId, note, items: [{ variantId, quantity, note }] }.
 * Returns { form: string|null, items: { [variantId]: { quantity?, note? } }, note: string|null, valid: boolean }.
 */
export const validateDraft = (draft) => {
  const errors = { form: null, note: null, items: {} }
  if (!draft.supplierId) errors.form = 'Vui lòng chọn nhà cung cấp.'
  else if (!draft.items.length) errors.form = 'Vui lòng thêm ít nhất một sản phẩm.'
  else if (draft.items.length > LIMITS.MAX_ITEMS) errors.form = `Một đơn tối đa ${LIMITS.MAX_ITEMS} dòng.`

  const seen = new Set()
  for (const item of draft.items) {
    const itemErrors = {}
    const q = validateQuantity(item.quantity)
    if (q) itemErrors.quantity = q
    const n = validateNote(item.note, LIMITS.MAX_ITEM_NOTE, 'Ghi chú dòng')
    if (n) itemErrors.note = n
    if (seen.has(item.variantId)) itemErrors.quantity = 'Sản phẩm bị trùng trong đơn.'
    seen.add(item.variantId)
    if (Object.keys(itemErrors).length) errors.items[item.variantId] = itemErrors
  }
  errors.note = validateNote(draft.note, LIMITS.MAX_PO_NOTE, 'Ghi chú đơn')
  return { ...errors, valid: !errors.form && !errors.note && Object.keys(errors.items).length === 0 }
}

/** Preview total only (the backend decides the real price and total). Cents-safe for 2-decimal prices. */
export const previewTotal = (items) =>
  items.reduce((sum, item) => {
    const qty = /^\d+$/.test(String(item.quantity ?? '').trim()) ? Number(String(item.quantity).trim()) : 0
    return sum + Math.round(Number(item.supplyPrice || 0) * 100) * qty
  }, 0) / 100
