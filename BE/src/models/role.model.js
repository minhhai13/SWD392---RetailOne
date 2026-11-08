const { col, defineModel } = require('./base.model');

module.exports = defineModel({
  name: 'Role',
  table: 'Roles',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    name: col('nvarchar(50)'),
    description: col('nvarchar(max)', { nullable: true }),
  },
});
