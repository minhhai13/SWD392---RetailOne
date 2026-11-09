const { fromDbId } = require('../../../utils/ids');

const toSupplierDto = (row) => ({
  id: row.id,
  name: row.name,
  taxId: row.taxId,
  phoneNumber: row.phoneNumber,
  address: row.address,
  status: row.status,
});

const toSupplierListItemDto = (row) => ({ ...toSupplierDto(row), orderableVariantCount: row.orderableVariantCount });

const toCatalogItemDto = (row) => ({
  variantId: row.variantId,
  productId: fromDbId(row.productId),
  productCode: row.productCode,
  productName: row.productName,
  baseUnit: row.baseUnit,
  unitName: row.unitName,
  conversionFactor: row.conversionFactor,
  barcode: row.barcode,
  unitType: row.unitType,
  supplyPrice: row.supplyPrice,
  priceUpdatedAt: row.priceUpdatedAt,
});

/** UC22.1: the selected variants, with current stock info (read-only) so the form can pre-populate. */
const toSelectedVariantDto = (row) => ({
  variantId: row.variantId,
  productId: fromDbId(row.productId),
  productCode: row.productCode,
  productName: row.productName,
  unitName: row.unitName,
  productStatus: row.productStatus,
  stock: row.quantityOnHand === null || row.quantityOnHand === undefined ? null : { quantityOnHand: row.quantityOnHand, minThreshold: row.minThreshold },
});

/** UC22.1: one supplier that provides some/all of the selected variants, with DB supply prices. */
const toSupplierCandidateDto = (supplierRow, items, missingVariantIds) => ({
  ...toSupplierDto(supplierRow),
  coversAll: missingVariantIds.length === 0,
  coveredVariantIds: items.map((i) => i.variantId),
  missingVariantIds,
  items,
});

module.exports = { toSupplierDto, toSupplierListItemDto, toCatalogItemDto, toSelectedVariantDto, toSupplierCandidateDto };
