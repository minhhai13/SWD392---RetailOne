const { col, defineModel } = require('../../../shared/models/base.model');

// poCode is a PERSISTED computed column derived from id: read-only. Supplier* columns are the BR-84 snapshot.
module.exports = defineModel({
  name: 'PurchaseOrder',
  table: 'PurchaseOrders',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    poCode: col('varchar(20)', { computed: true }),
    supplierId: col('int'),
    supplierName: col('nvarchar(255)'),
    supplierTaxId: col('varchar(20)'),
    supplierPhone: col('varchar(20)'),
    supplierAddress: col('nvarchar(255)', { nullable: true }),
    status: col('varchar(20)', { hasDefault: true }), // PENDING | APPROVED | RECEIVED | CANCELED
    totalAmount: col('decimal(18,2)', { hasDefault: true }),
    note: col('nvarchar(max)', { nullable: true }),
    createdBy: col('bigint'), // Staff.id
    createdAt: col('datetime2(7)', { hasDefault: true }),
    approvedBy: col('bigint', { nullable: true }),
    approvedAt: col('datetime2(7)', { nullable: true }),
    canceledBy: col('bigint', { nullable: true }),
    canceledAt: col('datetime2(7)', { nullable: true }),
    cancelReason: col('nvarchar(500)', { nullable: true }),
  },
});
