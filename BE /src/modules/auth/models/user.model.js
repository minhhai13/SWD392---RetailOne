const { col, defineModel } = require('../../../shared/models/base.model');

// Users.id is INT (not the Staff.id BIGINT used for audit columns)
module.exports = defineModel({
  name: 'User',
  table: 'Users',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    roleId: col('int'),
    username: col('varchar(50)'),
    passwordHash: col('varchar(255)'),
    isActive: col('varchar(20)', { hasDefault: true }), // 'active' | 'locked'
    requirePasswordChange: col('bit', { hasDefault: true }),
    createdAt: col('datetime2(7)', { hasDefault: true }),
  },
});
