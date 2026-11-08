const {createModel} = require('./base.model');

module.exports = function createPaymentModel(adapter) {
  return createModel(adapter, {
    table: 'Payments',
    fields: {
      invoiceId: 'bigint',
      paymentMethod: 'text',
      amount: 'money',
      receivedAmount: 'money',
      status: 'text',
      createdAt: 'datetime'
    }
  });
};
