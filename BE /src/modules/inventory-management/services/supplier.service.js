const supplierRepository = require('../repositories/supplier.repository');
const productVariantRepository = require('../repositories/productVariant.repository');
const { parseVariantIdList } = require('../validators/supplier.validator');
const supplierDto = require('../dtos/supplier.dto');
const { parseIntId } = require('../../../utils/ids');
const { notFound, unprocessable } = require('../../../utils/errors');

/**
 * UML PurchaseOrderService.validateSupplier(supplierId): supplier must exist and be Active (BR-86, PRE-2).
 * Used by both the lookup and PO creation.
 */
async function validateSupplier(supplierId, executor, { lock = false } = {}) {
  const supplier = await supplierRepository.getSupplierById(supplierId, executor, { lock });
  if (!supplier) throw notFound('SUPPLIER_NOT_FOUND', 'Supplier not found.', { supplierId });
  if (supplier.status !== 'Active') {
    throw unprocessable('SUPPLIER_INACTIVE', 'Purchase orders cannot be created for an inactive supplier.', { supplierId });
  }
  return supplier;
}

/** UC22.0.E2: the supplier must have at least one active mapped product with a supply price. */
async function assertSupplierHasProducts(supplierId, executor) {
  if ((await supplierRepository.countOrderableVariants(supplierId, executor)) === 0) {
    throw unprocessable('SUPPLIER_NO_MAPPED_PRODUCTS', 'The selected supplier has no active mapped products.', { supplierId });
  }
}

async function getActiveSuppliers() {
  return (await supplierRepository.getActiveSuppliers()).map(supplierDto.toSupplierListItemDto);
}

async function getSupplierCatalog(rawSupplierId) {
  const supplierId = parseIntId(rawSupplierId, 'supplierId');
  const supplier = await validateSupplier(supplierId);
  const items = (await supplierRepository.getSupplierCatalog(supplierId)).map(supplierDto.toCatalogItemDto);
  return { supplier: supplierDto.toSupplierDto(supplier), items };
}

/**
 * UC22.1 steps 1-3: for variants picked from the low-stock list, return the ACTIVE suppliers that provide them.
 * Prices come from SupplierProductPrices only. A supplier may cover only part of the selection: `coversAll`,
 * `coveredVariantIds` and `missingVariantIds` let the client pre-populate ONE supplier's products (a PO never mixes
 * suppliers). SRS does not say whether partial coverage qualifies, so partial suppliers are returned, flagged (Q18).
 */
async function getSuppliersForVariants(rawVariantIds) {
  const variantIds = parseVariantIdList(rawVariantIds);
  const found = await productVariantRepository.getVariantsByIds(variantIds, undefined, { withStock: true });
  const foundIds = new Set(found.map((v) => v.variantId));
  const unknownVariantIds = variantIds.filter((id) => !foundIds.has(id));
  const orderable = found.filter((v) => v.productStatus === 'Selling');
  const inactiveVariantIds = found.filter((v) => v.productStatus !== 'Selling').map((v) => v.variantId);
  const orderableIds = orderable.map((v) => v.variantId).sort((a, b) => a - b);

  const rows = await supplierRepository.getSuppliersForVariants(orderableIds);
  const bySupplier = new Map();
  for (const row of rows) {
    if (!bySupplier.has(row.id)) bySupplier.set(row.id, { row, items: [] });
    bySupplier.get(row.id).items.push({ variantId: row.variantId, supplyPrice: row.supplyPrice });
  }
  const suppliers = [...bySupplier.values()]
    .map(({ row, items }) => {
      const covered = new Set(items.map((i) => i.variantId));
      return supplierDto.toSupplierCandidateDto(row, items, orderableIds.filter((id) => !covered.has(id)));
    })
    .sort((a, b) => Number(b.coversAll) - Number(a.coversAll) || b.items.length - a.items.length || a.name.localeCompare(b.name) || a.id - b.id);

  return {
    selectedVariants: found.map(supplierDto.toSelectedVariantDto),
    unknownVariantIds,
    inactiveVariantIds,
    suppliers,
  };
}

module.exports = { validateSupplier, assertSupplierHasProducts, getActiveSuppliers, getSupplierCatalog, getSuppliersForVariants };
