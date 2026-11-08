const {createModel} = require('./base.model');

module.exports = function createProductModel(adapter) {
  return createModel(adapter, {
    table: 'Products',
    fields: {
      code: 'text',
      name: 'text',
      categoryId: 'int',
      baseUnit: 'text',
      allowDecimalQuantity: 'bit',
      isCombo: 'bit',
      status: 'text',
      imageUrl: 'text'
    }
  });
};
