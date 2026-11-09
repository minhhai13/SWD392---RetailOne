const { col, defineModel } = require('../../../shared/models/base.model');

// total and receivedTotal are PERSISTED computed columns (quantity * costPrice, receivedQuantity * costPrice): read-only.
module.exports = defineModel({
  name: 'PurchaseOrderItem',
  table: 'PurchaseOrderItems',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    poId: col('int'),
    variantId: col('int'),
    quantity: col('decimal(15,3)'),
    costPrice: col('decimal(15,2)'),
    note: col('nvarchar(500)', { nullable: true }),
    receivedQuantity: col('decimal(15,3)', { hasDefault: true }),
    receivedTotal: col('decimal(31,5)', { computed: true }),
    total: col('decimal(31,5)', { computed: true }),
  },
});
