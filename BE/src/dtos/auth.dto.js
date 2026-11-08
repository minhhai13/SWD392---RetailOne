const toUserInfo = (identity, permissions) => ({
  id: identity.userId,
  username: identity.username,
  staffId: identity.staffId,
  fullName: identity.fullName,
  role: { name: identity.roleName },
  permissions,
  requirePasswordChange: identity.requirePasswordChange,
});

module.exports = { toUserInfo };
