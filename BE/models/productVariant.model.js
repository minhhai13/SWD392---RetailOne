const {createModel} = require('./base.model');

module.exports = function createProductVariantModel(adapter) {
  return createModel(adapter, {
    table: 'ProductVariants',
    fields: {
      productId: 'bigint',
      unitName: 'text',
      conversionFactor: 'int',
      salePrice: 'money',
      barcode: 'text',
      unitType: 'text'
    }
  });
};
