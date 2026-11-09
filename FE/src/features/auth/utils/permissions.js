// Permission keys come from the backend (Features.featureKey). The backend still enforces security.
export const PERMISSIONS = Object.freeze({
  VIEW: 'VIEW_PURCHASE_ORDER',
  CREATE: 'CREATE_PURCHASE_ORDER',
  APPROVE: 'APPROVE_PURCHASE_ORDER',
  CANCEL: 'CANCEL_PURCHASE_ORDER',
})

export const hasPermission = (user, key) => Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(key))

/** The user may open purchase-order management at all (Cashier may not). */
export const canAccessProcurement = (user) => hasPermission(user, PERMISSIONS.VIEW) || hasPermission(user, PERMISSIONS.CREATE)

/** An action button is shown only when the backend says it is available for this PO AND the user holds the permission. */
export const canPerform = (user, availableActions, action) => {
  const needed = action === 'APPROVE' ? PERMISSIONS.APPROVE : action === 'CANCEL' ? PERMISSIONS.CANCEL : null
  return Boolean(needed) && Array.isArray(availableActions) && availableActions.includes(action) && hasPermission(user, needed)
}
