const {createModel} = require('./base.model');

module.exports = function createCustomerModel(adapter) {
  return createModel(adapter, {
    table: 'Customers',
    fields: {
      name: 'text',
      phone: 'text',
      status: 'text'
    }
  });
};
