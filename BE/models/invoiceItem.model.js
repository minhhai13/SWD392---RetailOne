const {createModel} = require('./base.model');

module.exports = function createInvoiceItemModel(adapter) {
  return createModel(adapter, {
    table: 'InvoiceItems',
    fields: {
      invoiceId: 'bigint',
      productId: 'bigint',
      variantId: 'int',
      batchId: 'bigint',
      productName: 'text',
      unitName: 'text',
      unitPrice: 'money',
      quantity: 'qty',
      lineTotal: 'money',
      baseQuantity: 'qty'
    }
  });
};
