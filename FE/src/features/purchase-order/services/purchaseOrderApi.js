import { apiClient, unwrap } from '../../../shared/services/apiClient'

const BASE = '/inventory/purchase-orders'

export const purchaseOrderApi = {
  /** UC23 GET list -> { items[], pagination{page,pageSize,total,totalPages}, filters } */
  list: async (params, signal) => unwrap(await apiClient.get(BASE, { params, signal })),
  /** UC24 GET detail -> PO detail (supplier snapshot, items, timeline, availableActions) */
  get: async (id, signal) => unwrap(await apiClient.get(`${BASE}/${id}`, { signal })),
  /**
   * UC22 POST create. `body` must contain ONLY { supplierId, note?, items:[{variantId, quantity, note?}] }.
   * Returns { data, message, meta, status }: status 201 = created, 200 = idempotent replay of an earlier request.
   */
  create: async (body, idempotencyKey) =>
    unwrap(await apiClient.post(BASE, body, { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined })),
  /** UC25 PATCH approve (no body: the approver is the authenticated staff) */
  approve: async (id) => unwrap(await apiClient.patch(`${BASE}/${id}/approve`)),
  /** UC26 PATCH cancel { reason } */
  cancel: async (id, reason) => unwrap(await apiClient.patch(`${BASE}/${id}/cancel`, { reason })),
}
