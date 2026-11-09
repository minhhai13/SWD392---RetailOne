const { col, defineModel } = require('../../../shared/models/base.model');

module.exports = defineModel({
  name: 'Product',
  table: 'Products',
  primaryKey: ['id'],
  columns: {
    id: col('bigint', { identity: true }),
    code: col('varchar(50)'),
    name: col('nvarchar(200)'),
    categoryId: col('int', { nullable: true }),
    baseUnit: col('nvarchar(20)'),
    allowDecimalQuantity: col('bit', { hasDefault: true }),
    isCombo: col('bit', { hasDefault: true }),
    status: col('varchar(20)', { hasDefault: true }), // 'Selling' | 'StopSelling' | 'Suspended'
    createdAt: col('datetime2(7)', { hasDefault: true }),
    updatedAt: col('datetime2(7)', { hasDefault: true }),
    imageUrl: col('nvarchar(500)', { nullable: true }),
  },
});
