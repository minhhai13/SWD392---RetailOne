const { col, defineModel } = require('./base.model');

// Staff.id is BIGINT: the id stored in PurchaseOrders.createdBy / approvedBy / canceledBy
module.exports = defineModel({
  name: 'Staff',
  table: 'Staff',
  primaryKey: ['id'],
  columns: {
    id: col('bigint', { identity: true }),
    userId: col('int'),
    fullName: col('nvarchar(100)'),
    phoneNumber: col('varchar(20)'),
    email: col('varchar(100)', { nullable: true }),
    salaryType: col('varchar(20)', { hasDefault: true }),
    baseSalary: col('decimal(15,2)', { hasDefault: true }),
    employmentStatus: col('varchar(20)', { hasDefault: true }), // 'working' | 'resigned'
    idCard: col('varchar(20)', { nullable: true }),
    resignationDate: col('date', { nullable: true }),
    createdAt: col('datetime2(7)', { hasDefault: true }),
  },
});
