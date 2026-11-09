/**
 * Idempotent, NON-destructive seed of Roles / Features / RoleFeatures from src/constants/permissions.js.
 * Only inserts what is missing (never deletes or edits existing mappings).
 */
const sql = require('mssql');
const { PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS } = require('../../src/constants/permissions');

async function ensureRbac(pool) {
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await pool.request().input('k', sql.VarChar(100), key).input('d', sql.NVarChar(sql.MAX), description)
      .query('IF NOT EXISTS (SELECT 1 FROM dbo.Features WHERE featureKey = @k) INSERT INTO dbo.Features (featureKey, description) VALUES (@k, @d)');
  }
  const roleIds = {};
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
    await pool.request().input('n', sql.NVarChar(50), roleName)
      .query('IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE name = @n) INSERT INTO dbo.Roles (name) VALUES (@n)');
    roleIds[roleName] = (await pool.request().input('n', sql.NVarChar(50), roleName).query('SELECT id FROM dbo.Roles WHERE name = @n')).recordset[0].id;
    for (const key of keys) {
      await pool.request().input('r', sql.Int, roleIds[roleName]).input('k', sql.VarChar(100), key).query(`
        INSERT INTO dbo.RoleFeatures (roleId, featureId)
        SELECT @r, f.id FROM dbo.Features f
        WHERE f.featureKey = @k AND NOT EXISTS (SELECT 1 FROM dbo.RoleFeatures x WHERE x.roleId = @r AND x.featureId = f.id)`);
    }
  }
  return { roleIds };
}

module.exports = { ensureRbac };
