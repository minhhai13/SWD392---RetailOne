const { badRequest } = require('../../../utils/errors');
const { single } = require('./common.validator');
const { LIMITS } = require('../../../constants/purchaseOrder');
const { parseIntId } = require('../../../utils/ids');

/** UC22.1: ?variantIds=1,2,3 -> [1,2,3] (distinct positive INTs, 1..MAX_ITEMS). */
function parseVariantIdList(value) {
  const text = single(value, 'variantIds');
  if (!text || !text.trim()) throw badRequest('EMPTY_ITEMS', 'At least one product variant must be selected.');
  const ids = [...new Set(text.split(',').map((part) => parseIntId(part.trim(), 'variantIds')))];
  if (ids.length > LIMITS.MAX_ITEMS) throw badRequest('TOO_MANY_ITEMS', `At most ${LIMITS.MAX_ITEMS} variants can be selected.`);
  return ids;
}

module.exports = { parseVariantIdList };
