const {createModel} = require('./base.model');

module.exports = function createStaffModel(adapter) {
  return createModel(adapter, {
    table: 'Staff',
    fields: {
      userId: 'int',
      fullName: 'text',
      phoneNumber: 'text',
      employmentStatus: 'text'
    }
  });
};
