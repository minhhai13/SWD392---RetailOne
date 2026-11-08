/** Purchase Order constants. Statuses mirror CK_PO_Status in the SQL schema (UPPERCASE). */
const PO_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  RECEIVED: 'RECEIVED',
  CANCELED: 'CANCELED',
});

const PO_STATUS_LIST = Object.freeze(Object.values(PO_STATUS));

// UC23.3 sort whitelist: API key -> SQL expression (never taken from user input)
const PO_SORT_COLUMNS = Object.freeze({
  createdAt: 'po.createdAt',
  supplierName: 'po.supplierName',
  totalAmount: 'po.totalAmount',
  status: 'po.status',
});

const LIMITS = Object.freeze({
  MAX_ITEMS: 200, // 4 SQL parameters per item must stay below the 2100 parameter limit
  MAX_QUANTITY: 999999999999, // DECIMAL(15,3) holds 12 integer digits
  MAX_INT: 2147483647, // INT identity columns
  MAX_ITEM_NOTE: 500, // PurchaseOrderItems.note NVARCHAR(500)
  MAX_PO_NOTE: 2000, // PurchaseOrders.note is NVARCHAR(MAX); API caps it
  MAX_CANCEL_REASON: 500, // PurchaseOrders.cancelReason NVARCHAR(500)
  MAX_SEARCH: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
});

module.exports = { PO_STATUS, PO_STATUS_LIST, PO_SORT_COLUMNS, LIMITS };
