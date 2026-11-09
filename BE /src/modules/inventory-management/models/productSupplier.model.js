const { col, defineModel } = require('../../../shared/models/base.model');

// Which products a supplier provides. status uses 'ACTIVE' | 'INACTIVE' (NOT the Suppliers/Products vocabulary).
module.exports = defineModel({
  name: 'ProductSupplier',
  table: 'ProductSuppliers',
  primaryKey: ['productId', 'supplierId'],
  columns: {
    productId: col('bigint'),
    supplierId: col('int'),
    status: col('varchar(20)', { hasDefault: true }),
  },
});
