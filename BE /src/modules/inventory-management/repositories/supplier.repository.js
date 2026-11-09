const { sql, newRequest } = require('../../../config/database');
const { fromDbId } = require('../../../utils/ids');
const { bindList } = require('./inClause');

// Orderable catalog (UC22 steps 3-4): ACTIVE mapping + product 'Selling' + a latest supply price > 0 (BR-81).
// The latest price is the newest SupplierProductPrices row by (createdAt DESC, id DESC).
const CATALOG_FROM = `
  FROM dbo.ProductSuppliers ps
  JOIN dbo.Products p ON p.id = ps.productId
  JOIN dbo.ProductVariants v ON v.productId = p.id
  CROSS APPLY (
    SELECT TOP 1 spp.price, spp.createdAt
    FROM dbo.SupplierProductPrices spp
    WHERE spp.supplierId = ps.supplierId AND spp.variantId = v.id
    ORDER BY spp.createdAt DESC, spp.id DESC
  ) lp
  WHERE ps.supplierId = @supplierId AND ps.status = 'ACTIVE' AND p.status = 'Selling' AND lp.price > 0`;

const mapSupplier = (row) =>
  row && {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    phoneNumber: row.phoneNumber,
    address: row.address,
    status: row.status,
  };

/** UML SupplierRepository.getSupplierById. `lock` keeps the status stable until the transaction ends (S lock held). */
async function getSupplierById(id, executor, { lock = false } = {}) {
  const hint = lock ? ' WITH (HOLDLOCK)' : '';
  const result = await newRequest(executor)
    .input('id', sql.Int, id)
    .query(`SELECT id, name, taxId, phoneNumber, address, status FROM dbo.Suppliers${hint} WHERE id = @id`);
  return mapSupplier(result.recordset[0]);
}

/** UC22 step 2: active suppliers with the number of orderable variants. */
async function getActiveSuppliers(executor) {
  const result = await newRequest(executor).query(`
    SELECT s.id, s.name, s.taxId, s.phoneNumber, s.address, s.status,
           (SELECT COUNT(*)
              FROM dbo.ProductSuppliers ps
              JOIN dbo.Products p ON p.id = ps.productId
              JOIN dbo.ProductVariants v ON v.productId = p.id
             WHERE ps.supplierId = s.id AND ps.status = 'ACTIVE' AND p.status = 'Selling'
               AND EXISTS (SELECT 1 FROM dbo.SupplierProductPrices x WHERE x.supplierId = s.id AND x.variantId = v.id)
           ) AS orderableVariantCount
    FROM dbo.Suppliers s
    WHERE s.status = 'Active'
    ORDER BY s.name, s.id`);
  return result.recordset.map((row) => ({ ...mapSupplier(row), orderableVariantCount: row.orderableVariantCount }));
}

/** UC22 step 4: variants a supplier can be ordered from, with the current supply price. */
async function getSupplierCatalog(supplierId, executor) {
  const result = await newRequest(executor).input('supplierId', sql.Int, supplierId).query(`
    SELECT v.id AS variantId, p.id AS productId, p.code AS productCode, p.name AS productName, p.baseUnit,
           v.unitName, v.conversionFactor, v.barcode, v.unitType,
           lp.price AS supplyPrice, lp.createdAt AS priceUpdatedAt
    ${CATALOG_FROM}
    ORDER BY p.name, v.conversionFactor, v.id`);
  return result.recordset.map((row) => ({ ...row, productId: fromDbId(row.productId) }));
}

async function countOrderableVariants(supplierId, executor) {
  const result = await newRequest(executor)
    .input('supplierId', sql.Int, supplierId)
    .query(`SELECT COUNT(*) AS n ${CATALOG_FROM}`);
  return result.recordset[0].n;
}

/** UML SupplierRepository.getProductSupplier, batched: which of these products have an ACTIVE mapping to the supplier. */
async function getActiveProductSuppliers(supplierId, productIds, executor) {
  if (!productIds.length) return new Set();
  const request = newRequest(executor).input('supplierId', sql.Int, supplierId);
  const list = bindList(request, 'p', sql.BigInt, productIds);
  const result = await request.query(
    `SELECT productId FROM dbo.ProductSuppliers WITH (HOLDLOCK) WHERE supplierId = @supplierId AND status = 'ACTIVE' AND productId IN (${list})`
  );
  return new Set(result.recordset.map((row) => String(row.productId)));
}

/**
 * UC22.1 step 2: ACTIVE suppliers that provide at least one of the selected variants (ACTIVE mapping, product 'Selling',
 * latest supply price > 0). One row per (supplier, variant) with the current supply price straight from the database.
 */
async function getSuppliersForVariants(variantIds, executor) {
  if (!variantIds.length) return [];
  const request = newRequest(executor);
  const list = bindList(request, 'v', sql.Int, variantIds);
  const result = await request.query(`
    SELECT s.id, s.name, s.taxId, s.phoneNumber, s.address, s.status, v.id AS variantId, lp.price AS supplyPrice
    FROM dbo.Suppliers s
    JOIN dbo.ProductSuppliers ps ON ps.supplierId = s.id AND ps.status = 'ACTIVE'
    JOIN dbo.ProductVariants v ON v.productId = ps.productId
    JOIN dbo.Products p ON p.id = v.productId AND p.status = 'Selling'
    CROSS APPLY (
      SELECT TOP 1 spp.price
      FROM dbo.SupplierProductPrices spp
      WHERE spp.supplierId = s.id AND spp.variantId = v.id
      ORDER BY spp.createdAt DESC, spp.id DESC
    ) lp
    WHERE s.status = 'Active' AND lp.price > 0 AND v.id IN (${list})
    ORDER BY s.name, s.id, v.id`);
  return result.recordset;
}

module.exports = { getSuppliersForVariants, getSupplierById, getActiveSuppliers, getSupplierCatalog, countOrderableVariants, getActiveProductSuppliers };
