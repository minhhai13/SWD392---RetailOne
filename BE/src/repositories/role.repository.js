const { sql, newRequest } = require('../config/database');

/** RBAC source of truth at runtime: Roles -> RoleFeatures -> Features.featureKey (no role id is hardcoded anywhere). */
async function getPermissionKeysByRoleId(roleId, executor) {
  const result = await newRequest(executor).input('roleId', sql.Int, roleId).query(`
    SELECT f.featureKey
    FROM dbo.RoleFeatures rf
    JOIN dbo.Features f ON f.id = rf.featureId
    WHERE rf.roleId = @roleId
    ORDER BY f.featureKey`);
  return result.recordset.map((row) => row.featureKey);
}

module.exports = { getPermissionKeysByRoleId };
