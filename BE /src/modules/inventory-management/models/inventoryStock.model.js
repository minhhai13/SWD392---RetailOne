const { col, defineModel } = require('../../../shared/models/base.model');

// Read-only for UC22.1 (low-stock info). PO create/approve/cancel never write this table (BR-45).
module.exports = defineModel({
  name: 'InventoryStock',
  table: 'InventoryStocks',
  primaryKey: ['variantId'],
  columns: {
    variantId: col('int'),
    quantityOnHand: col('decimal(15,3)', { hasDefault: true }),
    minThreshold: col('decimal(15,3)', { hasDefault: true }),
  },
});
