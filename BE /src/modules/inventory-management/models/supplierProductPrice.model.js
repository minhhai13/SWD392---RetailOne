const { col, defineModel } = require('../../../shared/models/base.model');

// Append-only supply price history; the newest row by (createdAt DESC, id DESC) is the current price (BR-81: price > 0).
module.exports = defineModel({
  name: 'SupplierProductPrice',
  table: 'SupplierProductPrices',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    supplierId: col('int'),
    variantId: col('int'),
    price: col('decimal(15,2)'),
    createdAt: col('datetime2(7)', { hasDefault: true }),
    createdBy: col('bigint', { nullable: true }),
  },
});
