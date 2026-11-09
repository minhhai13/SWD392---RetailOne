const { sql, newRequest } = require('../../../config/database');
const { fromDbId } = require('../../../utils/ids');

// Users (INT id) -> Roles (name) -> Staff (BIGINT id, one per user)
const IDENTITY_SELECT = `
  SELECT u.id AS userId, u.roleId, u.username, u.passwordHash, u.isActive, u.requirePasswordChange,
         r.name AS roleName, s.id AS staffId, s.fullName, s.employmentStatus
  FROM dbo.Users u
  JOIN dbo.Roles r ON r.id = u.roleId
  LEFT JOIN dbo.Staff s ON s.userId = u.id`;

const mapIdentity = (row) =>
  row && {
    userId: row.userId,
    roleId: row.roleId,
    username: row.username,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    requirePasswordChange: !!row.requirePasswordChange,
    roleName: row.roleName,
    staffId: fromDbId(row.staffId),
    fullName: row.fullName,
    employmentStatus: row.employmentStatus,
  };

async function findByUsername(username, executor) {
  const result = await newRequest(executor)
    .input('username', sql.VarChar(50), username)
    .query(`${IDENTITY_SELECT} WHERE u.username = @username`);
  return mapIdentity(result.recordset[0]);
}

async function findAuthIdentityByUserId(userId, executor) {
  const result = await newRequest(executor)
    .input('userId', sql.Int, userId)
    .query(`${IDENTITY_SELECT} WHERE u.id = @userId`);
  return mapIdentity(result.recordset[0]);
}

module.exports = { findByUsername, findAuthIdentityByUserId };
