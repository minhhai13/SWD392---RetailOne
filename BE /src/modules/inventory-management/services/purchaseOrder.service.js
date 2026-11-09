/**
 * Purchase Order use cases UC22-UC26 (Figure IV-33 PurchaseOrderService).
 * Business rules live here; SQL lives in the repositories. Everything that must be atomic runs in withTransaction()
 * and passes the transaction as `executor` to every repository call.
 *
 * Commit boundary: withTransaction() returns only after COMMIT. Reads used to build the response happen AFTER it, in
 * loadAfterCommit(); if such a read fails the write is NOT reported as failed (the PO exists) and a minimal body with
 * `detailLoaded: false` is returned instead.
 */
const { withTransaction } = require('../../../infrastructure/transaction');
const { store: idempotencyStore, fingerprintOf } = require('../../../infrastructure/idempotency');
const purchaseOrderRepository = require('../repositories/purchaseOrder.repository');
const supplierRepository = require('../repositories/supplier.repository');
const productVariantRepository = require('../repositories/productVariant.repository');
const supplierProductPriceRepository = require('../repositories/supplierProductPrice.repository');
const staffRepository = require('../../auth/repositories/staff.repository');
const supplierService = require('./supplier.service');
const validator = require('../validators/purchaseOrder.validator');
const dto = require('../dtos/purchaseOrder.dto');
const { PERMISSIONS } = require('../../../constants/permissions');
const { PO_STATUS } = require('../../../constants/purchaseOrder');
const { parseIntId } = require('../../../utils/ids');
const { forbidden, notFound, conflict, unprocessable, logError } = require('../../../utils/errors');

/** Defence in depth: routes already enforce permissions (BR-02, BR-42); the service refuses a wrong actor as well. */
function assertPermission(actor, permission) {
  if (!actor || !Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) {
    throw forbidden('FORBIDDEN', 'You do not have permission to perform this action.');
  }
}

/** The acting Staff row must exist and still be employed. Its id (BIGINT) is what gets stored in createdBy/approvedBy/canceledBy. */
async function assertStaffValid(actor, executor) {
  const staff = await staffRepository.getStaffById(actor.staffId, executor);
  if (!staff) throw forbidden('STAFF_NOT_FOUND', 'No staff profile is linked to this account.');
  if (staff.employmentStatus !== 'working') throw forbidden('STAFF_RESIGNED', 'This staff member is no longer employed.');
  return staff;
}

/**
 * UML validateItems: every variant must exist, its product must be 'Selling', the product must be ACTIVE-mapped to this
 * supplier (ProductSuppliers) and have a latest supply price > 0 (BR-81). Returns the items enriched with costPrice.
 * Rows are read with HOLDLOCK so nothing can be deactivated or re-priced before this transaction commits.
 */
async function validateItems(supplierId, items, executor) {
  const variantIds = items.map((i) => i.variantId);
  const variants = await productVariantRepository.getVariantsByIds(variantIds, executor, { lock: true });
  const variantById = new Map(variants.map((v) => [v.variantId, v]));

  const missing = variantIds.filter((id) => !variantById.has(id));
  if (missing.length) throw unprocessable('VARIANT_NOT_FOUND', 'Some variants do not exist.', { variantIds: missing });

  const inactive = variants.filter((v) => v.productStatus !== 'Selling').map((v) => v.variantId);
  if (inactive.length) throw unprocessable('PRODUCT_INACTIVE', 'Some products are not active for sale.', { variantIds: inactive });

  const productIds = [...new Set(variants.map((v) => v.productId))];
  const mapped = await supplierRepository.getActiveProductSuppliers(supplierId, productIds, executor);
  const unmapped = variants.filter((v) => !mapped.has(String(v.productId))).map((v) => v.variantId);
  if (unmapped.length) {
    throw unprocessable('VARIANT_NOT_SUPPLIED', 'Some variants are not supplied by the selected supplier.', { variantIds: unmapped });
  }

  const prices = await supplierProductPriceRepository.getLatestPrices(supplierId, variantIds, executor);
  const unpriced = variantIds.filter((id) => !(prices.get(id) > 0));
  if (unpriced.length) {
    throw unprocessable('PRICE_NOT_CONFIGURED', 'Some variants have no valid supply price.', { variantIds: unpriced });
  }

  return items.map((item) => ({ ...item, costPrice: prices.get(item.variantId) }));
}

/** UML calculateTotal: the total is computed by SQL Server from the stored lines (exact DECIMAL arithmetic). */
async function calculateTotal(poId, executor) {
  return purchaseOrderRepository.recalculateTotal(poId, executor);
}

/** Builds the response of a committed write. A read failure here must never turn a successful write into an error. */
async function loadAfterCommit(actor, id, fallback) {
  try {
    const detail = await purchaseOrderRepository.getPurchaseOrderDetail(id);
    if (!detail) throw new Error(`purchase order ${id} not found after commit`);
    return { purchaseOrder: dto.toDetailDto(detail, actor.permissions), detailLoaded: true };
  } catch (err) {
    logError(err);
    return { purchaseOrder: dto.toCommittedFallbackDto(fallback), detailLoaded: false };
  }
}

async function createOnce(actor, input) {
  const created = await withTransaction(async (tx) => {
    await assertStaffValid(actor, tx);
    const supplier = await supplierService.validateSupplier(input.supplierId, tx, { lock: true });
    await supplierService.assertSupplierHasProducts(supplier.id, tx);
    const lines = await validateItems(supplier.id, input.items, tx);

    // header + items + total in ONE transaction: any failure below rolls back all of it
    const header = await purchaseOrderRepository.createPurchaseOrder({ supplier, note: input.note, createdBy: actor.staffId }, tx);
    await purchaseOrderRepository.insertItems(header.id, lines, tx);
    await calculateTotal(header.id, tx);
    return { id: header.id, poCode: header.poCode, supplier };
  });
  // COMMIT done
  return loadAfterCommit(actor, created.id, {
    id: created.id,
    poCode: created.poCode,
    status: PO_STATUS.PENDING,
    supplier: { id: created.supplier.id, name: created.supplier.name },
  });
}

/**
 * UC22 - Create Purchase Order. One supplier -> one PENDING PO, all-or-nothing.
 * With an Idempotency-Key a client retry returns the first PO instead of creating a duplicate.
 * @returns {{ purchaseOrder, detailLoaded: boolean, replay: boolean }}
 */
async function createPurchaseOrder(actor, body, { idempotencyKey = null } = {}) {
  assertPermission(actor, PERMISSIONS.CREATE_PURCHASE_ORDER);
  const input = validator.parseCreateInput(body);

  if (!idempotencyKey) return { ...(await createOnce(actor, input)), replay: false };

  const fingerprint = fingerprintOf({ ...input, items: [...input.items].sort((a, b) => a.variantId - b.variantId) });
  const { result, replay } = await idempotencyStore.run(String(actor.staffId), idempotencyKey, fingerprint, () => createOnce(actor, input));
  return { ...result, replay };
}

/** UC23 - View Purchase Orders (read-only). */
async function getPurchaseOrders(actor, query) {
  assertPermission(actor, PERMISSIONS.VIEW_PURCHASE_ORDER);
  const filters = validator.parseListQuery(query);
  const { rows, total } = await purchaseOrderRepository.getPurchaseOrders(filters);
  return {
    items: rows.map(dto.toSummaryDto),
    pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) },
    filters: { status: filters.status, from: filters.from, to: filters.to, q: filters.q, sortBy: filters.sortBy, sortDir: filters.sortDir },
  };
}

/** UC24 - View Purchase Order Details (read-only). */
async function getPurchaseOrderDetail(actor, rawId) {
  assertPermission(actor, PERMISSIONS.VIEW_PURCHASE_ORDER);
  const id = parseIntId(rawId, 'id');
  const detail = await purchaseOrderRepository.getPurchaseOrderDetail(id);
  if (!detail) throw notFound('PO_NOT_FOUND', 'Purchase order not found.', { id });
  return dto.toDetailDto(detail, actor.permissions);
}

const invalidStatus = (id, currentStatus) =>
  conflict('PO_INVALID_STATUS', `Purchase order is ${currentStatus} and cannot be changed this way.`, { id, currentStatus });

/** UC25 - Approve Purchase Order (Manager only). @returns {{ purchaseOrder, detailLoaded }} */
async function approvePurchaseOrder(actor, rawId) {
  assertPermission(actor, PERMISSIONS.APPROVE_PURCHASE_ORDER);
  const id = parseIntId(rawId, 'id');

  await withTransaction(async (tx) => {
    await assertStaffValid(actor, tx);
    const po = await purchaseOrderRepository.getPurchaseOrderForUpdate(id, tx); // row is locked from here
    if (!po) throw notFound('PO_NOT_FOUND', 'Purchase order not found.', { id });
    if (po.status !== PO_STATUS.PENDING) throw invalidStatus(id, po.status); // E1

    const supplier = await supplierRepository.getSupplierById(po.supplierId, tx, { lock: true });
    if (!supplier || supplier.status !== 'Active') {
      throw unprocessable('SUPPLIER_INACTIVE', 'The supplier of this purchase order is inactive.', { id, supplierId: po.supplierId }); // E2
    }
    const products = await purchaseOrderRepository.getOrderedProducts(id, tx);
    const inactive = products.filter((p) => p.status !== 'Selling');
    if (inactive.length) {
      throw unprocessable('PRODUCT_INACTIVE', 'Some ordered products are no longer active.', {
        id,
        products: inactive.map((p) => ({ id: p.id, code: p.code, status: p.status })),
      }); // E2
    }

    const updated = await purchaseOrderRepository.updatePurchaseOrderStatus(id, { toStatus: PO_STATUS.APPROVED, processedBy: actor.staffId }, tx);
    if (!updated) throw invalidStatus(id, 'changed by another request');
  });
  // COMMIT done
  return loadAfterCommit(actor, id, { id, status: PO_STATUS.APPROVED });
}

/** UC26 - Cancel Purchase Order (Manager only). @returns {{ purchaseOrder, detailLoaded }} */
async function cancelPurchaseOrder(actor, rawId, body) {
  assertPermission(actor, PERMISSIONS.CANCEL_PURCHASE_ORDER);
  const id = parseIntId(rawId, 'id');
  const { reason } = validator.parseCancelInput(body); // E2: reason required

  await withTransaction(async (tx) => {
    await assertStaffValid(actor, tx);
    const po = await purchaseOrderRepository.getPurchaseOrderForUpdate(id, tx); // row is locked from here
    if (!po) throw notFound('PO_NOT_FOUND', 'Purchase order not found.', { id });
    if (![PO_STATUS.PENDING, PO_STATUS.APPROVED].includes(po.status)) throw invalidStatus(id, po.status); // E1, BR-43
    if (await purchaseOrderRepository.hasGoodReceipt(id, tx)) {
      throw conflict('GOODS_RECEIPT_EXISTS', 'A goods receipt already exists for this purchase order.', { id }); // E1
    }

    const updated = await purchaseOrderRepository.updatePurchaseOrderStatus(id, { toStatus: PO_STATUS.CANCELED, processedBy: actor.staffId, reason }, tx);
    if (!updated) throw invalidStatus(id, 'changed by another request');
  });
  // COMMIT done
  return loadAfterCommit(actor, id, { id, status: PO_STATUS.CANCELED, cancelReason: reason });
}

module.exports = {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderDetail,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  validateItems,
  calculateTotal,
};
