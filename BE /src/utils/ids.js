const { badRequest } = require('./errors');
const { LIMITS } = require('../constants/purchaseOrder');

/** BIGINT columns come back from the driver as strings; convert to Number when it is a safe integer. */
const fromDbId = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : String(value);
};

/** Parse a positive INT id coming from a URL/query/body (digits only, no decimals, within INT range). */
function parseIntId(value, field = 'id') {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > LIMITS.MAX_INT) {
    throw badRequest('INVALID_ID', `${field} must be a positive integer.`, { field });
  }
  return Number(raw);
}

module.exports = { fromDbId, parseIntId };
