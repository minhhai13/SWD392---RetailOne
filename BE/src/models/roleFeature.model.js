const { col, defineModel } = require('./base.model');

module.exports = defineModel({
  name: 'RoleFeature',
  table: 'RoleFeatures',
  primaryKey: ['roleId', 'featureId'],
  columns: {
    roleId: col('int'),
    featureId: col('int'),
  },
});
