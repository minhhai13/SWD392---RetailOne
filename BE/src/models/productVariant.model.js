const { col, defineModel } = require('./base.model');

module.exports = defineModel({
  name: 'ProductVariant',
  table: 'ProductVariants',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    productId: col('bigint'),
    unitName: col('nvarchar(20)'),
    conversionFactor: col('int'),
    salePrice: col('decimal(15,2)'),
    barcode: col('varchar(50)', { nullable: true }),
    unitType: col('varchar(20)', { hasDefault: true }),
  },
});
