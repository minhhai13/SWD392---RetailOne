const {createModel} = require('./base.model');

module.exports = function createBatchModel(adapter) {
  return createModel(adapter, {
    table: 'Batches',
    fields: {
      batchCode: 'text',
      variantId: 'int',
      initialQuantity: 'qty',
      quantity: 'qty',
      expirationDate: 'date',
      status: 'text',
      updatedAt: 'datetime'
    }
  });
};
