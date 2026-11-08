/**
 * Input validation for the purchase-order endpoints. The client NEVER supplies price, total, status, supplier snapshot
 * or actor ids: unknown body fields are simply ignored. Limits come from the entity models where the schema defines them.
 */
const { PO_STATUS_LIST, PO_SORT_COLUMNS, LIMITS } = require('../constants/purchaseOrder');
const { PurchaseOrder, PurchaseOrderItem } = require('../models');
const { badRequest } = require('../utils/errors');
const { parseIntId } = require('../utils/ids');
const { isPlainObject, single, parseDate, parsePositiveInt, parseOptionalText } = require('./common.validator');

const MAX_ITEM_NOTE = PurchaseOrderItem.maxLength('note'); // NVARCHAR(500)
const MAX_CANCEL_REASON = PurchaseOrder.maxLength('cancelReason'); // NVARCHAR(500)

/** UC22.0.E1: only positive whole numbers (user decision, OPEN-QUESTIONS Q2), even though the column is DECIMAL(15,3). */
function parseQuantity(value, index) {
  const asNumber = typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value) ? Number(value) : value;
  if (typeof asNumber !== 'number' || !Number.isInteger(asNumber) || asNumber < 1 || asNumber > LIMITS.MAX_QUANTITY) {
    throw badRequest('INVALID_QUANTITY', 'Quantity must be a positive whole number.', { itemIndex: index });
  }
  return asNumber;
}

/** POST /purchase-orders body -> { supplierId, note, items: [{ variantId, quantity, note }] } */
function parseCreateInput(body) {
  if (!isPlainObject(body)) throw badRequest('VALIDATION_ERROR', 'Request body must be a JSON object.');
  const supplierId = parseIntId(body.supplierId, 'supplierId');

  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('EMPTY_ITEMS', 'At least one item is required.');
  if (body.items.length > LIMITS.MAX_ITEMS) {
    throw badRequest('TOO_MANY_ITEMS', `A purchase order can contain at most ${LIMITS.MAX_ITEMS} items.`);
  }

  const seen = new Set();
  const items = body.items.map((raw, index) => {
    if (!isPlainObject(raw)) throw badRequest('VALIDATION_ERROR', 'Each item must be an object.', { itemIndex: index });
    const variantId = parseIntId(raw.variantId, 'variantId');
    if (seen.has(variantId)) {
      throw badRequest('DUPLICATE_VARIANT', 'The same variant appears more than once.', { variantId, itemIndex: index });
    }
    seen.add(variantId);
    return { variantId, quantity: parseQuantity(raw.quantity, index), note: parseOptionalText(raw.note, MAX_ITEM_NOTE, 'item note') };
  });

  return { supplierId, note: parseOptionalText(body.note, LIMITS.MAX_PO_NOTE, 'note'), items };
}

/** UC26.0.E2: reason required, trimmed, at most NVARCHAR(500). */
function parseCancelInput(body) {
  const reason = isPlainObject(body) && typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) throw badRequest('REASON_REQUIRED', 'A cancellation reason is required.');
  if (reason.length > MAX_CANCEL_REASON) throw badRequest('REASON_TOO_LONG', `Cancellation reason must be at most ${MAX_CANCEL_REASON} characters.`);
  return { reason };
}

/** GET /purchase-orders query -> filters; anything reaching SQL is whitelisted here or bound as a parameter later. */
function parseListQuery(query = {}) {
  const statusText = single(query.status, 'status');
  const status = statusText ? statusText.trim().toUpperCase() : null;
  if (status && !PO_STATUS_LIST.includes(status)) {
    throw badRequest('INVALID_STATUS', `status must be one of ${PO_STATUS_LIST.join(', ')}.`, { field: 'status' });
  }

  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to');
  if (from && to && from > to) throw badRequest('INVALID_DATE_RANGE', '"from" must not be after "to".');

  const qText = single(query.q, 'q');
  const q = qText ? qText.trim() : '';
  if (q.length > LIMITS.MAX_SEARCH) throw badRequest('VALIDATION_ERROR', `q must be at most ${LIMITS.MAX_SEARCH} characters.`, { field: 'q' });

  const sortBy = single(query.sortBy, 'sortBy') || 'createdAt';
  if (!Object.prototype.hasOwnProperty.call(PO_SORT_COLUMNS, sortBy)) {
    throw badRequest('INVALID_SORT', `sortBy must be one of ${Object.keys(PO_SORT_COLUMNS).join(', ')}.`, { field: 'sortBy' });
  }
  const sortDir = (single(query.sortDir, 'sortDir') || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(sortDir)) throw badRequest('INVALID_SORT', 'sortDir must be asc or desc.', { field: 'sortDir' });

  return {
    status,
    from,
    to,
    q: q || null,
    sortBy,
    sortDir,
    page: parsePositiveInt(query.page, 'page', 1, 1000000),
    pageSize: parsePositiveInt(query.pageSize, 'pageSize', LIMITS.DEFAULT_PAGE_SIZE, LIMITS.MAX_PAGE_SIZE),
  };
}

/** Optional `Idempotency-Key` header for UC22 retries: 8-128 chars of [A-Za-z0-9_-]. */
function parseIdempotencyKey(headerValue) {
  if (headerValue === undefined || headerValue === '') return null;
  if (typeof headerValue !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(headerValue)) {
    throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-128 characters of letters, digits, "-" or "_".');
  }
  return headerValue;
}

module.exports = { parseCreateInput, parseCancelInput, parseListQuery, parseIdempotencyKey, MAX_CANCEL_REASON, MAX_ITEM_NOTE };
