/**
 * Phase 0 - verifies the REAL backend API contract the frontend relies on (no mocks).
 * Needs a running backend + SQL Server and seeded demo accounts. Passwords come from the environment (never hardcoded):
 *   CONTRACT_API_BASE=http://localhost:5001/api  (default: VITE_API_BASE_URL or http://localhost:5001/api)
 *   CONTRACT_MANAGER_PASSWORD=... CONTRACT_WAREHOUSE_PASSWORD=... CONTRACT_CASHIER_PASSWORD=...
 * It creates ONE purchase order of its own and approves/cancels only that one. Usage: npm run contract
 */
import axios from 'axios'

const base = process.env.CONTRACT_API_BASE || process.env.VITE_API_BASE_URL || 'http://localhost:5001/api'
const users = {
  manager: [process.env.CONTRACT_MANAGER_USER || 'manager', process.env.CONTRACT_MANAGER_PASSWORD],
  warehouse: [process.env.CONTRACT_WAREHOUSE_USER || 'warehouse', process.env.CONTRACT_WAREHOUSE_PASSWORD],
  cashier: [process.env.CONTRACT_CASHIER_USER || 'cashier', process.env.CONTRACT_CASHIER_PASSWORD],
}
for (const [k, [, pw]] of Object.entries(users)) if (!pw) throw new Error(`Set CONTRACT_${k.toUpperCase()}_PASSWORD`)

const http = axios.create({ baseURL: base, timeout: 15000, validateStatus: () => true })
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${extra}`}`)
}
const hasKeys = (obj, keys) => obj && typeof obj === 'object' && keys.every((k) => k in obj)
const missing = (obj, keys) => keys.filter((k) => !(obj && k in obj)).join(',')

const login = async (who) => {
  const r = await http.post('/auth/login', { username: users[who][0], password: users[who][1] })
  return { r, token: r.data?.data?.token }
}
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

const USER_KEYS = ['id', 'username', 'staffId', 'fullName', 'role', 'permissions', 'requirePasswordChange']
const PO_ITEM_KEYS = ['id', 'variantId', 'productId', 'productCode', 'productName', 'unitName', 'conversionFactor', 'quantity', 'costPrice', 'total', 'receivedQuantity', 'note']
const PO_DETAIL_KEYS = ['id', 'poCode', 'status', 'note', 'supplier', 'totalAmount', 'createdBy', 'approvedBy', 'canceledBy', 'createdAt', 'approvedAt', 'canceledAt', 'cancelReason', 'items', 'timeline', 'availableActions']

const health = await http.get('/health')
check('GET /health', health.status === 200 && health.data?.data?.status === 'ok')

const m = await login('manager')
const w = await login('warehouse')
const c = await login('cashier')
check('POST /auth/login -> data.token + data.user (manager)', m.r.status === 200 && typeof m.token === 'string' && hasKeys(m.r.data.data.user, USER_KEYS), missing(m.r.data?.data?.user, USER_KEYS))
check('login: role.name + permissions[] (manager has 4, warehouse has 2, cashier has 0)', m.r.data.data.user.role.name === 'Manager' && m.r.data.data.user.permissions.length === 4 && w.r.data.data.user.role.name === 'Warehouse Staff' && w.r.data.data.user.permissions.length === 2 && c.r.data.data.user.role.name === 'Cashier' && c.r.data.data.user.permissions.length === 0)
const bad = await http.post('/auth/login', { username: users.manager[0], password: 'wrong-password' })
check('login wrong password -> 401 INVALID_CREDENTIALS', bad.status === 401 && bad.data.code === 'INVALID_CREDENTIALS')
const me = await http.get('/auth/me', auth(m.token))
check('GET /auth/me -> user shape', me.status === 200 && hasKeys(me.data.data, USER_KEYS))
check('no token -> 401', (await http.get('/inventory/purchase-orders')).status === 401)
check('cashier GET /inventory/purchase-orders -> 403 FORBIDDEN', (await http.get('/inventory/purchase-orders', auth(c.token))).data?.code === 'FORBIDDEN')

const sup = await http.get('/inventory/suppliers', auth(w.token))
const supKeys = ['id', 'name', 'taxId', 'phoneNumber', 'address', 'status', 'orderableVariantCount']
check('GET /inventory/suppliers -> array of suppliers', sup.status === 200 && Array.isArray(sup.data.data) && sup.data.data.length > 0 && hasKeys(sup.data.data[0], supKeys), missing(sup.data.data?.[0], supKeys))
const supplier = sup.data.data.find((s) => s.orderableVariantCount >= 2) || sup.data.data[0]
const cat = await http.get(`/inventory/suppliers/${supplier.id}/products`, auth(w.token))
const catKeys = ['variantId', 'productId', 'productCode', 'productName', 'baseUnit', 'unitName', 'conversionFactor', 'barcode', 'unitType', 'supplyPrice', 'priceUpdatedAt']
check('GET /suppliers/:id/products -> { supplier, items[] }', cat.status === 200 && hasKeys(cat.data.data, ['supplier', 'items']) && hasKeys(cat.data.data.items[0], catKeys), missing(cat.data.data?.items?.[0], catKeys))
const items = cat.data.data.items.slice(0, 2)
const byV = await http.get('/inventory/suppliers/by-variants', { ...auth(w.token), params: { variantIds: items.map((i) => i.variantId).join(',') } })
check('GET /suppliers/by-variants (UC22.1 helper) -> suppliers[] with coversAll', byV.status === 200 && Array.isArray(byV.data.data.suppliers) && hasKeys(byV.data.data.suppliers[0], ['coversAll', 'coveredVariantIds', 'missingVariantIds', 'items']))

const list = await http.get('/inventory/purchase-orders', { ...auth(w.token), params: { sortBy: 'totalAmount', sortDir: 'desc', page: 1, pageSize: 5 } })
const listKeys = ['id', 'poCode', 'createdAt', 'supplierId', 'supplierName', 'createdBy', 'createdByName', 'totalAmount', 'status', 'itemCount']
check('GET /purchase-orders -> items[] + pagination{page,pageSize,total,totalPages}', list.status === 200 && hasKeys(list.data.data.pagination, ['page', 'pageSize', 'total', 'totalPages']) && (list.data.data.items.length === 0 || hasKeys(list.data.data.items[0], listKeys)), missing(list.data.data?.items?.[0], listKeys))
const empty = await http.get('/inventory/purchase-orders', { ...auth(w.token), params: { q: 'zz-no-such-po-xyz' } })
check('empty result -> 200, items [] + message', empty.status === 200 && empty.data.data.items.length === 0 && typeof empty.data.message === 'string')
check('invalid sort -> 400 INVALID_SORT', (await http.get('/inventory/purchase-orders', { ...auth(w.token), params: { sortBy: 'poCode' } })).data?.code === 'INVALID_SORT')
check('invalid date range -> 400 INVALID_DATE_RANGE', (await http.get('/inventory/purchase-orders', { ...auth(w.token), params: { from: '2026-12-31', to: '2026-01-01' } })).data?.code === 'INVALID_DATE_RANGE')

// ---- UC22: create (warehouse), replay with the same Idempotency-Key ----
const key = `contract-${Date.now()}-check`
const body = { supplierId: supplier.id, note: 'contract check', items: items.map((i, n) => ({ variantId: i.variantId, quantity: n + 2 })) }
const created = await http.post('/inventory/purchase-orders', body, { headers: { ...auth(w.token).headers, 'Idempotency-Key': key } })
const po = created.data?.data
check('POST /purchase-orders -> 201, status PENDING, full detail shape', created.status === 201 && po?.status === 'PENDING' && hasKeys(po, PO_DETAIL_KEYS) && hasKeys(po.items[0], PO_ITEM_KEYS), missing(po, PO_DETAIL_KEYS))
check('create: createdBy is {staffId, fullName}; approvedBy/canceledBy null; availableActions [] for warehouse', hasKeys(po?.createdBy, ['staffId', 'fullName']) && po.approvedBy === null && po.canceledBy === null && po.availableActions.length === 0)
check('create: server priced the lines (costPrice == catalog supplyPrice) and computed the total', po.items.every((it, n) => it.costPrice === items[n].supplyPrice) && po.totalAmount === po.items.reduce((s, it) => s + it.total, 0))
const replay = await http.post('/inventory/purchase-orders', body, { headers: { ...auth(w.token).headers, 'Idempotency-Key': key } })
check('retry with same Idempotency-Key -> 200 (not 201), same PO, header Idempotent-Replay: true', replay.status === 200 && replay.data.data.id === po.id && replay.headers['idempotent-replay'] === 'true')
const dup = await http.post('/inventory/purchase-orders', { ...body, items: [body.items[0], body.items[0]] }, auth(w.token))
check('duplicate variant -> 400 DUPLICATE_VARIANT', dup.data?.code === 'DUPLICATE_VARIANT')
check('quantity 1.5 -> 400 INVALID_QUANTITY', (await http.post('/inventory/purchase-orders', { supplierId: supplier.id, items: [{ variantId: items[0].variantId, quantity: 1.5 }] }, auth(w.token))).data?.code === 'INVALID_QUANTITY')
check('empty items -> 400 EMPTY_ITEMS', (await http.post('/inventory/purchase-orders', { supplierId: supplier.id, items: [] }, auth(w.token))).data?.code === 'EMPTY_ITEMS')

// ---- UC24 detail ----
const det = await http.get(`/inventory/purchase-orders/${po.id}`, auth(m.token))
check('GET /purchase-orders/:id -> supplier snapshot {id,name,taxId,phoneNumber,address} + timeline[CREATED]', det.status === 200 && hasKeys(det.data.data.supplier, ['id', 'name', 'taxId', 'phoneNumber', 'address']) && det.data.data.timeline[0].event === 'CREATED' && hasKeys(det.data.data.timeline[0], ['event', 'at', 'by']))
check('detail for manager: availableActions = [APPROVE, CANCEL]', JSON.stringify(det.data.data.availableActions) === JSON.stringify(['APPROVE', 'CANCEL']))
const nf = await http.get('/inventory/purchase-orders/2147483000', auth(m.token))
check('unknown PO -> 404 PO_NOT_FOUND', nf.status === 404 && nf.data.code === 'PO_NOT_FOUND')

// ---- UC25 approve ----
check('warehouse approve -> 403 FORBIDDEN', (await http.patch(`/inventory/purchase-orders/${po.id}/approve`, null, auth(w.token))).status === 403)
const ap = await http.patch(`/inventory/purchase-orders/${po.id}/approve`, null, auth(m.token))
check('manager approve -> 200 APPROVED, approvedBy {staffId,fullName}, availableActions [CANCEL]', ap.status === 200 && ap.data.data.status === 'APPROVED' && hasKeys(ap.data.data.approvedBy, ['staffId', 'fullName']) && JSON.stringify(ap.data.data.availableActions) === '["CANCEL"]')
const ap2 = await http.patch(`/inventory/purchase-orders/${po.id}/approve`, null, auth(m.token))
check('approve again -> 409 PO_INVALID_STATUS (details.currentStatus)', ap2.status === 409 && ap2.data.code === 'PO_INVALID_STATUS' && ap2.data.details?.currentStatus === 'APPROVED')

// ---- UC26 cancel ----
check('cancel without reason -> 400 REASON_REQUIRED', (await http.patch(`/inventory/purchase-orders/${po.id}/cancel`, { reason: '   ' }, auth(m.token))).data?.code === 'REASON_REQUIRED')
check('cancel reason > 500 -> 400 REASON_TOO_LONG', (await http.patch(`/inventory/purchase-orders/${po.id}/cancel`, { reason: 'x'.repeat(501) }, auth(m.token))).data?.code === 'REASON_TOO_LONG')
check('warehouse cancel -> 403', (await http.patch(`/inventory/purchase-orders/${po.id}/cancel`, { reason: 'x' }, auth(w.token))).status === 403)
const cn = await http.patch(`/inventory/purchase-orders/${po.id}/cancel`, { reason: '  contract check cancel  ' }, auth(m.token))
check('manager cancel -> 200 CANCELED, cancelReason trimmed, canceledBy object, availableActions []', cn.status === 200 && cn.data.data.status === 'CANCELED' && cn.data.data.cancelReason === 'contract check cancel' && hasKeys(cn.data.data.canceledBy, ['staffId', 'fullName']) && cn.data.data.availableActions.length === 0)
check('timeline after cancel = CREATED, APPROVED, CANCELED (with reason)', JSON.stringify(cn.data.data.timeline.map((t) => t.event)) === '["CREATED","APPROVED","CANCELED"]' && cn.data.data.timeline[2].reason === 'contract check cancel')
check('cancel again -> 409 PO_INVALID_STATUS', (await http.patch(`/inventory/purchase-orders/${po.id}/cancel`, { reason: 'again' }, auth(m.token))).data?.code === 'PO_INVALID_STATUS')

// ---- CORS (informational, see FE-OPEN-QUESTIONS) ----
const cors = await http.get('/health', { headers: { Origin: 'http://localhost:5173' } })
const exposed = cors.headers['access-control-expose-headers']
console.log(`INFO  CORS: access-control-allow-origin=${cors.headers['access-control-allow-origin'] || '(none)'}; access-control-expose-headers=${exposed || '(not set)'} -> a browser ${exposed ? 'can' : 'cannot'} read custom response headers such as Idempotent-Replay cross-origin`)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
