const {createModel} = require('./base.model');

module.exports = function createInvoiceModel(adapter) {
  return createModel(adapter, {
    table: 'Invoices',
    fields: {
      invoiceCode: 'text',
      staffId: 'bigint',
      counterId: 'bigint',
      scheduleId: 'int',
      customerId: 'bigint',
      totalAmount: 'money',
      promotionDiscount: 'money',
      voucherDiscount: 'money',
      pointDiscount: 'money',
      usedPoints: 'int',
      finalAmount: 'money',
      taxRate: 'rate',
      taxAmount: 'money',
      status: 'text',
      createdAt: 'datetime'
    }
  });
};
