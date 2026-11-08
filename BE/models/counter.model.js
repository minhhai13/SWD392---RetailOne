const {createModel} = require('./base.model');

module.exports = function createCounterModel(adapter) {
  return createModel(adapter, {
    table: 'Counters',
    fields: {
      counterCode: 'text',
      counterName: 'text',
      status: 'text'
    }
  });
};
