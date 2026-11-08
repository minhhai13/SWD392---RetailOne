const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const roleRepository = require('../repositories/role.repository');
const { unauthorized, forbidden, AppError } = require('../utils/errors');

/**
 * Verifies the Bearer JWT, then reloads identity AND permissions from SQL Server on every request, so a locked user,
 * a resigned staff member or a changed role/feature mapping takes effect immediately.
 * req.user.userId = Users.id (INT); req.user.staffId = Staff.id (BIGINT) -> the only id used for audit columns;
 * req.user.permissions = Features.featureKey values granted to the user's role through RoleFeatures.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    throw unauthorized('UNAUTHORIZED', 'Authentication required.');
  }
  if (!process.env.JWT_SECRET) {
    throw new AppError(500, 'CONFIG_ERROR', 'Server authentication is not configured.');
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw unauthorized('TOKEN_EXPIRED', 'Token has expired.');
    throw unauthorized('INVALID_TOKEN', 'Token is invalid.');
  }
  if (!payload || !Number.isInteger(payload.userId)) {
    throw unauthorized('INVALID_TOKEN', 'Token is invalid.');
  }

  const identity = await userRepository.findAuthIdentityByUserId(payload.userId);
  if (!identity) throw unauthorized('INVALID_TOKEN', 'Token is invalid.');

  assertAccountUsable(identity);

  req.user = {
    userId: identity.userId,
    staffId: identity.staffId,
    username: identity.username,
    fullName: identity.fullName,
    roleId: identity.roleId,
    roleName: identity.roleName,
    permissions: await roleRepository.getPermissionKeysByRoleId(identity.roleId),
  };
  next();
}

/** Shared by login and authenticate: locked user / missing staff / resigned staff are rejected with 403. */
function assertAccountUsable(identity) {
  if (identity.isActive !== 'active') throw forbidden('ACCOUNT_LOCKED', 'This account is locked.');
  if (identity.staffId === null) throw forbidden('STAFF_NOT_FOUND', 'No staff profile is linked to this account.');
  if (identity.employmentStatus !== 'working') throw forbidden('STAFF_RESIGNED', 'This staff member is no longer employed.');
}

module.exports = { authenticate, assertAccountUsable };
