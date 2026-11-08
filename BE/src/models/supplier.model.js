const { col, defineModel } = require('./base.model');

module.exports = defineModel({
  name: 'Supplier',
  table: 'Suppliers',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    name: col('nvarchar(255)'),
    taxId: col('varchar(20)'),
    phoneNumber: col('varchar(20)'),
    contactInfo: col('nvarchar(255)', { nullable: true }),
    address: col('nvarchar(255)', { nullable: true }),
    returnPolicy: col('varchar(20)', { hasDefault: true }),
    status: col('varchar(20)', { hasDefault: true }), // 'Active' | 'Inactive'
    createdAt: col('datetime2(7)', { hasDefault: true }),
  },
});
