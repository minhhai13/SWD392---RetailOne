const {createModel} = require('./base.model');

module.exports = function createSepayTransactionModel(adapter) {
  return createModel(adapter, {
    table: 'SepayTransactions',
    fields: {
      invoiceId: 'bigint',
      sepayId: 'text',
      transactionContent: 'text',
      amountIn: 'money',
      bankAccountNumber: 'text',
      qrUrl: 'text',
      expiresAt: 'datetime',
      status: 'text',
      createdAt: 'datetime',
      confirmAt: 'datetime'
    }
  });
};
