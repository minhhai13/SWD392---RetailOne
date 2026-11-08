const {createModel} = require('./base.model');

module.exports = function createCategoryModel(adapter) {
  return createModel(adapter, {
    table: 'Categories',
    fields: {
      name: 'text'
    }
  });
};
