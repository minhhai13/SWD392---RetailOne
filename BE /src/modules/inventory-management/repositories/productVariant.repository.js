const { sql, newRequest } = require('../../../config/database');
const { fromDbId } = require('../../../utils/ids');
const { bindList } = require('./inClause');

/**
 * UML ProductVariantRepository.getVariantsByIds. Joins Products so the caller can check Products.status
 * ('Selling' / 'StopSelling' / 'Suspended'). `lock` holds a shared range lock on the product rows until the
 * transaction ends, so a product cannot be deactivated between validation and insert.
 * `withStock` (UC22.1, read-only) also returns InventoryStocks.quantityOnHand / minThreshold.
 */
async function getVariantsByIds(variantIds, executor, { lock = false, withStock = false } = {}) {
  if (!variantIds.length) return [];
  const request = newRequest(executor);
  const list = bindList(request, 'v', sql.Int, variantIds);
  const hint = lock ? ' WITH (HOLDLOCK)' : '';
  const result = await request.query(`
    SELECT v.id AS variantId, v.productId, v.unitName, v.conversionFactor,
           p.code AS productCode, p.name AS productName, p.status AS productStatus${withStock ? ', st.quantityOnHand, st.minThreshold' : ''}
    FROM dbo.ProductVariants v
    JOIN dbo.Products AS p${hint} ON p.id = v.productId${withStock ? ' LEFT JOIN dbo.InventoryStocks st ON st.variantId = v.id' : ''}
    WHERE v.id IN (${list})`);
  return result.recordset.map((row) => ({ ...row, productId: fromDbId(row.productId) }));
}

module.exports = { getVariantsByIds };
