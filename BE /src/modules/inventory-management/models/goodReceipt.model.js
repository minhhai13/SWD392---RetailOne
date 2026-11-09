const { col, defineModel } = require('../../../shared/models/base.model');

// UC31 owns this table. UC22-UC26 only READ it (UC26 guard, UC24 timeline). receiptCode is computed.
module.exports = defineModel({
  name: 'GoodReceipt',
  table: 'GoodReceipts',
  primaryKey: ['id'],
  columns: {
    id: col('int', { identity: true }),
    receiptCode: col('varchar(20)', { computed: true }),
    poId: col('int'),
    receivedBy: col('bigint'),
    receivedAt: col('datetime2(7)', { hasDefault: true }),
    totalQuantity: col('decimal(15,3)', { hasDefault: true }),
    totalValue: col('decimal(18,2)', { hasDefault: true }),
    note: col('nvarchar(max)', { nullable: true }),
  },
});
