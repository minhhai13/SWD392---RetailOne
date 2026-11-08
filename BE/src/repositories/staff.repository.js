const { sql, newRequest } = require('../config/database');
const { fromDbId } = require('../utils/ids');

/** UML StaffRepository.getStaffById(id: BIGINT). */
async function getStaffById(id, executor) {
  const result = await newRequest(executor)
    .input('id', sql.BigInt, id)
    .query('SELECT id, userId, fullName, employmentStatus FROM dbo.Staff WHERE id = @id');
  const row = result.recordset[0];
  return row ? { id: fromDbId(row.id), userId: row.userId, fullName: row.fullName, employmentStatus: row.employmentStatus } : null;
}

module.exports = { getStaffById };
