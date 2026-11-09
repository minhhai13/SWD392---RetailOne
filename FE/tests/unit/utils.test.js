import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatQuantity, formatStaff, formatVnd, orDash } from '../../src/shared/utils/format'
import { LIMITS, previewTotal, validateCancelReason, validateDateRange, validateDraft, validateNote, validateQuantity } from '../../src/features/purchase-order/utils/validators'
import { canAccessProcurement, canPerform, hasPermission, PERMISSIONS } from '../../src/features/auth/utils/permissions'
import { getErrorMessage, isCommitUnknown, isOutcomeUnknown, NETWORK_MESSAGE, TIMEOUT_MESSAGE } from '../../src/shared/utils/errorMessages'
import { classifyActionError } from '../../src/features/purchase-order/utils/actionErrors'
import { DEFAULT_QUERY, parsePoQuery, serializePoQuery, toApiParams } from '../../src/features/purchase-order/utils/poQuery'
import { generateIdempotencyKey, isValidIdempotencyKey } from '../../src/features/purchase-order/utils/idempotency'
import { buildCreatePayload } from '../../src/features/purchase-order/utils/poPayload'
import { draftReducer, initialDraft, isDirty } from '../../src/features/purchase-order/utils/draftReducer'
import { pageWindow } from '../../src/features/purchase-order/utils/pagination'
import { statusMeta } from '../../src/features/purchase-order/utils/status'

describe('money / date formatting (FE-UT-01)', () => {
  it('formats VND with Vietnamese grouping and keeps decimals', () => {
    expect(formatVnd(95000)).toMatch(/95\.000/)
    expect(formatVnd(95000)).toContain('₫')
    expect(formatVnd(31500.5)).toMatch(/31\.500,5/)
    expect(formatVnd('1110000')).toMatch(/1\.110\.000/)
    expect(formatVnd(0)).toMatch(/0/)
  })
  it('handles null / undefined / invalid without crashing', () => {
    for (const v of [null, undefined, '', 'abc']) expect(formatVnd(v)).toBe('—')
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not a date')).toBe('—')
    expect(formatQuantity(null)).toBe('—')
    expect(orDash(null)).toBe('—')
    expect(orDash('x')).toBe('x')
    expect(formatStaff(null)).toBe('—')
    expect(formatStaff({ staffId: 1, fullName: 'Demo Manager' })).toBe('Demo Manager')
  })
  it('shows dates in Vietnam time (UTC+7)', () => {
    expect(formatDateTime('2026-11-08T17:30:00.000Z')).toContain('09/11/2026')
    expect(formatDateTime('2026-11-08T17:30:00.000Z')).toContain('00:30')
    expect(formatDate('2026-11-08T10:00:00.000Z')).toBe('08/11/2026')
  })
  it('formats quantities as whole numbers with grouping', () => {
    expect(formatQuantity(1500)).toBe('1.500')
    expect(formatQuantity('50.000')).toBe('50')
  })
})

describe('validators (FE-UT-02)', () => {
  it('quantity must be a positive whole number', () => {
    for (const ok of ['1', ' 12 ', 999999999999, '007']) expect(validateQuantity(ok)).toBeNull()
    for (const bad of ['', '  ', '0', '-1', '1.5', '1,5', 'abc', '1e3', '9999999999999', null, undefined]) expect(validateQuantity(bad)).not.toBeNull()
  })
  it('cancel reason: required after trim, at most 500 characters', () => {
    expect(validateCancelReason('')).toMatch(/Vui lòng/)
    expect(validateCancelReason('   \n ')).toMatch(/Vui lòng/)
    expect(validateCancelReason('  lý do  ')).toBeNull()
    expect(validateCancelReason('a'.repeat(500))).toBeNull()
    expect(validateCancelReason('a'.repeat(501))).toMatch(/500/)
    expect(validateCancelReason(`  ${'a'.repeat(500)}  `)).toBeNull() // trimmed length counts
  })
  it('date range and notes', () => {
    expect(validateDateRange('2026-01-01', '2026-01-31')).toBeNull()
    expect(validateDateRange('2026-01-01', '2026-01-01')).toBeNull()
    expect(validateDateRange('2026-02-01', '2026-01-31')).toMatch(/không được sau/)
    expect(validateDateRange('', '2026-01-31')).toBeNull()
    expect(validateNote('x'.repeat(501), LIMITS.MAX_ITEM_NOTE)).not.toBeNull()
    expect(validateNote('ok', LIMITS.MAX_ITEM_NOTE)).toBeNull()
  })
  it('validateDraft: supplier, empty items, bad quantity, duplicates', () => {
    const item = (variantId, quantity = '1', note = '') => ({ variantId, quantity, note })
    expect(validateDraft({ supplierId: null, note: '', items: [] }).form).toMatch(/nhà cung cấp/)
    expect(validateDraft({ supplierId: 1, note: '', items: [] }).form).toMatch(/ít nhất một/)
    expect(validateDraft({ supplierId: 1, note: '', items: [item(1)] }).valid).toBe(true)
    const bad = validateDraft({ supplierId: 1, note: '', items: [item(1, '0'), item(2, '1.5'), item(3, 'x')] })
    expect(bad.valid).toBe(false)
    expect(Object.keys(bad.items)).toEqual(['1', '2', '3'])
    const dup = validateDraft({ supplierId: 1, note: '', items: [item(1), item(1)] })
    expect(dup.items[1].quantity).toMatch(/trùng/)
    expect(validateDraft({ supplierId: 1, note: 'x'.repeat(2001), items: [item(1)] }).note).not.toBeNull()
  })
  it('previewTotal is exact for 2-decimal prices (no float drift)', () => {
    expect(previewTotal([{ supplyPrice: 0.1, quantity: '3' }, { supplyPrice: 0.2, quantity: '3' }])).toBe(0.9)
    expect(previewTotal([{ supplyPrice: 12345.67, quantity: '3' }])).toBe(37037.01)
    expect(previewTotal([{ supplyPrice: 100, quantity: 'abc' }])).toBe(0)
    expect(previewTotal([])).toBe(0)
  })
})

describe('create payload (FE-UT-03) - UC22 request body', () => {
  it('contains only supplierId, note and items[variantId, quantity, note]', () => {
    const payload = buildCreatePayload({
      supplierId: '3', note: '  ghi chú  ', costPrice: 1, totalAmount: 1, status: 'APPROVED',
      items: [{ variantId: '10', quantity: ' 2 ', note: ' dòng ', supplyPrice: 999, productName: 'x', costPrice: 5, total: 5 }, { variantId: 11, quantity: '3', note: '   ' }],
    })
    expect(payload).toEqual({ supplierId: 3, note: 'ghi chú', items: [{ variantId: 10, quantity: 2, note: 'dòng' }, { variantId: 11, quantity: 3 }] })
    const text = JSON.stringify(payload)
    for (const forbidden of ['costPrice', 'total', 'totalAmount', 'poCode', 'status', 'createdBy', 'approvedBy', 'managerId', 'supplierName', 'supplyPrice']) expect(text).not.toContain(`"${forbidden}"`)
  })
  it('omits empty notes', () => {
    expect(buildCreatePayload({ supplierId: 1, note: '  ', items: [{ variantId: 1, quantity: '1', note: '' }] })).toEqual({ supplierId: 1, items: [{ variantId: 1, quantity: 1 }] })
  })
})

describe('permissions (FE-UT-04)', () => {
  const manager = { permissions: Object.values(PERMISSIONS) }
  const warehouse = { permissions: [PERMISSIONS.VIEW, PERMISSIONS.CREATE] }
  const cashier = { permissions: [] }
  it('hasPermission / canAccessProcurement', () => {
    expect(hasPermission(manager, PERMISSIONS.APPROVE)).toBe(true)
    expect(hasPermission(warehouse, PERMISSIONS.APPROVE)).toBe(false)
    expect(hasPermission(null, PERMISSIONS.VIEW)).toBe(false)
    expect(hasPermission({}, PERMISSIONS.VIEW)).toBe(false)
    expect(canAccessProcurement(manager)).toBe(true)
    expect(canAccessProcurement(warehouse)).toBe(true)
    expect(canAccessProcurement(cashier)).toBe(false)
  })
  it('an action needs BOTH availableActions and the permission', () => {
    expect(canPerform(manager, ['APPROVE', 'CANCEL'], 'APPROVE')).toBe(true)
    expect(canPerform(manager, ['CANCEL'], 'APPROVE')).toBe(false)
    expect(canPerform(warehouse, ['APPROVE', 'CANCEL'], 'APPROVE')).toBe(false)
    expect(canPerform(warehouse, ['APPROVE', 'CANCEL'], 'CANCEL')).toBe(false)
    expect(canPerform(manager, undefined, 'CANCEL')).toBe(false)
    expect(canPerform(manager, ['CANCEL'], 'DELETE')).toBe(false)
  })
})

describe('error mapper (FE-UT-05)', () => {
  it('maps backend codes to Vietnamese text and never echoes raw backend text', () => {
    expect(getErrorMessage({ status: 409, code: 'GOODS_RECEIPT_EXISTS', message: 'SQL: boom' })).toMatch(/phiếu nhận hàng/)
    expect(getErrorMessage({ status: 409, code: 'PO_INVALID_STATUS' })).toMatch(/Trạng thái đơn/)
    expect(getErrorMessage({ status: 403, code: 'FORBIDDEN' })).toMatch(/không đủ quyền/)
    expect(getErrorMessage({ status: 500, code: 'COMMIT_OUTCOME_UNKNOWN' })).toMatch(/kiểm tra lại/)
    expect(getErrorMessage({ status: 500, code: 'DB_ERROR', message: 'Login failed for user sa' })).not.toMatch(/Login failed|sa'/)
  })
  it('falls back by HTTP status, network and timeout', () => {
    expect(getErrorMessage({ status: 422 })).toMatch(/nghiệp vụ/)
    expect(getErrorMessage({ status: 503 })).toMatch(/Máy chủ/)
    expect(getErrorMessage({ isNetwork: true })).toBe(NETWORK_MESSAGE)
    expect(getErrorMessage({ isTimeout: true })).toBe(TIMEOUT_MESSAGE)
    expect(getErrorMessage(null)).toMatch(/lỗi/)
  })
  it('knows when a write outcome is unknown', () => {
    expect(isOutcomeUnknown({ isNetwork: true })).toBe(true)
    expect(isOutcomeUnknown({ isTimeout: true })).toBe(true)
    expect(isOutcomeUnknown({ code: 'COMMIT_OUTCOME_UNKNOWN' })).toBe(true)
    expect(isOutcomeUnknown({ status: 422, code: 'SUPPLIER_INACTIVE' })).toBe(false)
    expect(isCommitUnknown({ code: 'COMMIT_OUTCOME_UNKNOWN' })).toBe(true)
    expect(isCommitUnknown({ isNetwork: true })).toBe(false)
  })
  it('classifies approve/cancel failures', () => {
    expect(classifyActionError({ status: 409, code: 'PO_INVALID_STATUS' })).toMatchObject({ mode: 'stale', close: true, reload: true })
    expect(classifyActionError({ status: 409, code: 'GOODS_RECEIPT_EXISTS' })).toMatchObject({ mode: 'stale', reload: true })
    expect(classifyActionError({ status: 409, code: 'CONCURRENT_UPDATE' })).toMatchObject({ mode: 'inline', close: false })
    expect(classifyActionError({ status: 403, code: 'FORBIDDEN' })).toMatchObject({ mode: 'blocked', close: true, reload: false })
    expect(classifyActionError({ status: 422, code: 'SUPPLIER_INACTIVE' })).toMatchObject({ mode: 'blocked' })
    expect(classifyActionError({ isNetwork: true })).toMatchObject({ mode: 'unknown', variant: 'warning', reload: true })
    expect(classifyActionError({ status: 500, code: 'COMMIT_OUTCOME_UNKNOWN' })).toMatchObject({ mode: 'unknown' })
    expect(classifyActionError({ status: 500, code: 'DB_ERROR' })).toMatchObject({ mode: 'inline' })
  })
})

describe('URL query state (FE-UT-06)', () => {
  it('parses defaults and falls back on invalid values', () => {
    expect(parsePoQuery(new URLSearchParams(''))).toEqual({ status: '', from: '', to: '', q: '', sortBy: 'createdAt', sortDir: 'desc', page: 1, pageSize: 20 })
    const q = parsePoQuery(new URLSearchParams('sortBy=hack;DROP&sortDir=sideways&page=-3&pageSize=5000'))
    expect([q.sortBy, q.sortDir, q.page, q.pageSize]).toEqual(['createdAt', 'desc', 1, 20])
  })
  it('round-trips and omits defaults', () => {
    const query = { status: 'PENDING', from: '2026-01-01', to: '', q: 'abc', sortBy: 'totalAmount', sortDir: 'asc', page: 2, pageSize: 50 }
    const params = serializePoQuery(query)
    expect(params.toString()).toBe('status=PENDING&from=2026-01-01&q=abc&sortBy=totalAmount&sortDir=asc&page=2&pageSize=50')
    expect(parsePoQuery(params)).toEqual(query)
    expect(serializePoQuery({ ...DEFAULT_QUERY, status: '', from: '', to: '', q: '' }).toString()).toBe('')
  })
  it('API params only include non-empty filters', () => {
    expect(toApiParams(parsePoQuery(new URLSearchParams('status=APPROVED&page=3')))).toEqual({ status: 'APPROVED', sortBy: 'createdAt', sortDir: 'desc', page: 3, pageSize: 20 })
  })
})

describe('misc helpers (FE-UT-07)', () => {
  it('idempotency keys satisfy the backend format and are unique', () => {
    const a = generateIdempotencyKey()
    expect(isValidIdempotencyKey(a)).toBe(true)
    expect(a).not.toBe(generateIdempotencyKey())
    expect(isValidIdempotencyKey('short')).toBe(false)
    expect(isValidIdempotencyKey('has space 12345')).toBe(false)
  })
  it('draft reducer: add (no duplicates), edit, remove, supplier change clears items', () => {
    const item = { variantId: 1, productName: 'A', unitName: 'u', supplyPrice: 10 }
    let s = draftReducer(initialDraft, { type: 'setSupplier', supplierId: 5 })
    s = draftReducer(s, { type: 'addItem', item })
    s = draftReducer(s, { type: 'addItem', item })
    expect(s.items).toHaveLength(1)
    expect(s.items[0].quantity).toBe('1')
    s = draftReducer(s, { type: 'setQuantity', variantId: 1, value: '7' })
    s = draftReducer(s, { type: 'setItemNote', variantId: 1, value: 'n' })
    expect(s.items[0]).toMatchObject({ quantity: '7', note: 'n' })
    expect(isDirty(s)).toBe(true)
    expect(draftReducer(s, { type: 'setSupplier', supplierId: 6 }).items).toEqual([])
    expect(draftReducer(s, { type: 'removeItem', variantId: 1 }).items).toEqual([])
    expect(isDirty({ supplierId: 5, note: '', items: [] })).toBe(false)
    expect(isDirty({ supplierId: 5, note: ' x ', items: [] })).toBe(true)
  })
  it('pagination window with ellipsis; status colours', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(10, 20)).toEqual([1, 'gap-8', 8, 9, 10, 11, 12, 'gap-20', 20])
    expect(statusMeta('PENDING').label).toBe('Chờ duyệt')
    expect(statusMeta('CANCELED').bg).toBe('danger')
    expect(statusMeta('WEIRD').bg).toBe('secondary')
  })
})
