import { apiClient, unwrap } from './axiosClient'

export const supplierApi = {
  /** GET /inventory/suppliers -> [{ id, name, taxId, phoneNumber, address, status, orderableVariantCount }] */
  listSuppliers: async (signal) => unwrap(await apiClient.get('/inventory/suppliers', { signal })).data,
  /** GET /inventory/suppliers/:id/products -> { supplier, items: [{ variantId, productName, unitName, supplyPrice, ... }] } */
  getCatalog: async (supplierId, signal) => unwrap(await apiClient.get(`/inventory/suppliers/${supplierId}/products`, { signal })).data,
  /** UC22.1 helper (no Stock Level screen in this FE): GET /inventory/suppliers/by-variants?variantIds=1,2 */
  getSuppliersByVariants: async (variantIds, signal) =>
    unwrap(await apiClient.get('/inventory/suppliers/by-variants', { params: { variantIds: variantIds.join(',') }, signal })).data,
}
