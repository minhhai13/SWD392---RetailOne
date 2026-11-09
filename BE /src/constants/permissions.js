/**
 * RBAC for UC22-UC26 uses Features.featureKey (permission keys). At runtime the keys of the caller are read from
 * SQL Server (Users -> Roles -> RoleFeatures -> Features). ROLE_PERMISSIONS below is only the SEED definition:
 * scripts/lib/rbac.js writes it into Roles / Features / RoleFeatures.
 */
const { ROLES } = require('./roles');

const PERMISSIONS = Object.freeze({
  VIEW_PURCHASE_ORDER: 'VIEW_PURCHASE_ORDER', // UC23, UC24
  CREATE_PURCHASE_ORDER: 'CREATE_PURCHASE_ORDER', // UC22 (+ its supplier/catalog lookups)
  APPROVE_PURCHASE_ORDER: 'APPROVE_PURCHASE_ORDER', // UC25
  CANCEL_PURCHASE_ORDER: 'CANCEL_PURCHASE_ORDER', // UC26
});

const PERMISSION_DESCRIPTIONS = Object.freeze({
  [PERMISSIONS.VIEW_PURCHASE_ORDER]: 'View purchase orders and their details (UC23, UC24)',
  [PERMISSIONS.CREATE_PURCHASE_ORDER]: 'Create purchase orders and look up suppliers/catalogs for them (UC22)',
  [PERMISSIONS.APPROVE_PURCHASE_ORDER]: 'Approve a pending purchase order (UC25)',
  [PERMISSIONS.CANCEL_PURCHASE_ORDER]: 'Cancel a purchase order (UC26)',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.MANAGER]: Object.values(PERMISSIONS),
  [ROLES.WAREHOUSE_STAFF]: [PERMISSIONS.VIEW_PURCHASE_ORDER, PERMISSIONS.CREATE_PURCHASE_ORDER],
  [ROLES.CASHIER]: [], // BR-02: no access to purchasing
});

module.exports = { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS };
