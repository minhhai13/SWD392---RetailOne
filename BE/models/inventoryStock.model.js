const {createModel} = require('./base.model');

module.exports = function createInventoryStockModel(adapter) {
  return createModel(adapter, {
    table: 'InventoryStocks',
    key: 'variantId',
    fields: {
      quantityOnHand: 'qty',
      minThreshold: 'qty'
    }
  });
};
