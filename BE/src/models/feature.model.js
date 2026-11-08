const { col, defineModel } = require('./base.model');

// Features = permission keys (e.g. APPROVE_PURCHASE_ORDER)
module.exports = defineModel({
  name: 'Feature',
  table: 'Features',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    featureKey: col('varchar(100)'),
    description: col('nvarchar(max)', { nullable: true }),
  },
});
