const { sql, newRequest } = require('../../../config/database');
const { bindList } = require('./inClause');

/**
 * UML SupplierProductPriceRepository.getLatestPrice, batched.
 * Latest = newest row by (createdAt DESC, id DESC) for the (supplierId, variantId) pair (BR-81, schema comment).
 * Returns Map<variantId, price>. Price rows are held with a shared range lock until the transaction ends, so a
 * price inserted concurrently cannot change what the PO line was validated against.
 */
async function getLatestPrices(supplierId, variantIds, executor) {
  const prices = new Map();
  if (!variantIds.length) return prices;
  const request = newRequest(executor).input('supplierId', sql.Int, supplierId);
  const list = bindList(request, 'v', sql.Int, variantIds);
  const result = await request.query(`
    SELECT x.variantId, x.price
    FROM (
      SELECT spp.variantId, spp.price,
             ROW_NUMBER() OVER (PARTITION BY spp.variantId ORDER BY spp.createdAt DESC, spp.id DESC) AS rn
      FROM dbo.SupplierProductPrices spp WITH (HOLDLOCK)
      WHERE spp.supplierId = @supplierId AND spp.variantId IN (${list})
    ) x
    WHERE x.rn = 1`);
  for (const row of result.recordset) prices.set(row.variantId, row.price);
  return prices;
}

module.exports = { getLatestPrices };
