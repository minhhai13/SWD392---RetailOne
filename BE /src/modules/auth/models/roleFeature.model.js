const { col, defineModel } = require('../../../shared/models/base.model');

module.exports = defineModel({
  name: 'RoleFeature',
  table: 'RoleFeatures',
  primaryKey: ['roleId', 'featureId'],
  columns: {
    roleId: col('int'),
    featureId: col('int'),
  },
});
