const modelFactories = {
  Staff: require('./staff.model'),
  Counter: require('./counter.model'),
  Customer: require('./customer.model'),
  Category: require('./category.model'),
  Product: require('./product.model'),
  ProductVariant: require('./productVariant.model'),
  InventoryStock: require('./inventoryStock.model'),
  Batch: require('./batch.model'),
  Invoice: require('./invoice.model'),
  InvoiceItem: require('./invoiceItem.model'),
  Payment: require('./payment.model'),
  SepayTransaction: require('./sepayTransaction.model')
};

function createModels(adapter) {
  return Object.fromEntries(
    Object.entries(modelFactories).map(([name, createModel]) => [name, createModel(adapter)])
  );
}

module.exports = {createModels};
