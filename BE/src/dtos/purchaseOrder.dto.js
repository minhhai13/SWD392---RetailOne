/** Response mapping (entity rows -> API shapes). Pure functions: no SQL, no I/O. */
const { PO_STATUS } = require('../constants/purchaseOrder');
const { PERMISSIONS } = require('../constants/permissions');
const { PurchaseOrder } = require('../models');
const { fromDbId } = require('../utils/ids');

const staffRef = (id, name) => (id === null || id === undefined ? null : { staffId: fromDbId(id), fullName: name });

/** UC23 list row. */
function toSummaryDto(row) {
  const po = PurchaseOrder.hydrate(row);
  return {
    id: po.id,
    poCode: po.poCode,
    createdAt: po.createdAt,
    supplierId: po.supplierId,
    supplierName: po.supplierName, // snapshot (BR-84)
    createdBy: po.createdBy,
    createdByName: row.createdByName,
    totalAmount: po.totalAmount,
    status: po.status,
    itemCount: row.itemCount,
  };
}

/** UC24 step 4: which actions the CURRENT caller may take (derived from permission keys + status + receipt). */
function computeAvailableActions(permissions, status, hasReceipt) {
  if (hasReceipt) return [];
  const actions = [];
  if (status === PO_STATUS.PENDING && permissions.includes(PERMISSIONS.APPROVE_PURCHASE_ORDER)) actions.push('APPROVE');
  if ([PO_STATUS.PENDING, PO_STATUS.APPROVED].includes(status) && permissions.includes(PERMISSIONS.CANCEL_PURCHASE_ORDER)) actions.push('CANCEL');
  return actions;
}

/**
 * UC24 detail. `timeline` is derived from lifecycle timestamps only; it is NOT a full audit log
 * (the schema has no status-history table, OPEN-QUESTIONS Q3).
 */
function toDetailDto({ header, items, receipt }, permissions) {
  const po = PurchaseOrder.hydrate(header);
  const timeline = [{ event: 'CREATED', at: po.createdAt, by: staffRef(po.createdBy, header.createdByName) }];
  if (po.approvedAt) timeline.push({ event: 'APPROVED', at: po.approvedAt, by: staffRef(po.approvedBy, header.approvedByName) });
  if (receipt) timeline.push({ event: 'RECEIVED', at: receipt.receivedAt, by: staffRef(receipt.receivedBy, receipt.receivedByName) });
  if (po.canceledAt) {
    timeline.push({ event: 'CANCELED', at: po.canceledAt, by: staffRef(po.canceledBy, header.canceledByName), reason: po.cancelReason });
  }
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    id: po.id,
    poCode: po.poCode,
    status: po.status,
    note: po.note,
    supplier: { id: po.supplierId, name: po.supplierName, taxId: po.supplierTaxId, phoneNumber: po.supplierPhone, address: po.supplierAddress }, // snapshot (BR-84)
    totalAmount: po.totalAmount,
    createdBy: staffRef(po.createdBy, header.createdByName),
    createdAt: po.createdAt,
    approvedBy: staffRef(po.approvedBy, header.approvedByName),
    approvedAt: po.approvedAt,
    canceledBy: staffRef(po.canceledBy, header.canceledByName),
    canceledAt: po.canceledAt,
    cancelReason: po.cancelReason,
    items: items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productId: fromDbId(i.productId),
      productCode: i.productCode,
      productName: i.productName,
      unitName: i.unitName,
      conversionFactor: i.conversionFactor,
      quantity: i.quantity,
      costPrice: i.costPrice, // snapshot at creation
      total: i.total,
      receivedQuantity: i.receivedQuantity,
      note: i.note,
    })),
    timeline,
    availableActions: computeAvailableActions(permissions, po.status, !!receipt),
  };
}

/** Minimal body returned when the write COMMITTED but re-reading the PO failed (see service loadAfterCommit). */
const toCommittedFallbackDto = (fields) => ({ ...fields });

module.exports = { toSummaryDto, toDetailDto, computeAvailableActions, toCommittedFallbackDto };
