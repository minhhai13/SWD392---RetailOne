const { forbidden, unauthorized } = require('../utils/errors');

/**
 * Feature-based RBAC (replaces the legacy authorize() that let every request through).
 * Usage: router.patch('/:id/approve', authorizePermission(PERMISSIONS.APPROVE_PURCHASE_ORDER), handler)
 * Must run after authenticate(). Every listed permission must be granted to the caller's role via RoleFeatures.
 */
const authorizePermission = (...required) => (req, res, next) => {
  if (!req.user) throw unauthorized('UNAUTHORIZED', 'Authentication required.');
  if (!required.every((key) => req.user.permissions.includes(key))) {
    throw forbidden('FORBIDDEN', 'You do not have permission to perform this action.');
  }
  next();
};

module.exports = { authorizePermission };
