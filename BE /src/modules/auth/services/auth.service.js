const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const roleRepository = require('../repositories/role.repository');
const { assertAccountUsable } = require('../../../middlewares/auth.middleware');
const { parseLoginInput } = require('../validators/auth.validator');
const { toUserInfo } = require('../dtos/auth.dto');
const { unauthorized, AppError } = require('../../../utils/errors');

// Compared against when the username does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function login(body) {
  const { username, password } = parseLoginInput(body);
  if (!process.env.JWT_SECRET) throw new AppError(500, 'CONFIG_ERROR', 'Server authentication is not configured.');

  const identity = await userRepository.findByUsername(username);
  const matches = await bcrypt.compare(password, identity ? identity.passwordHash : DUMMY_HASH);
  if (!identity || !matches) throw unauthorized('INVALID_CREDENTIALS', 'Invalid username or password.');

  assertAccountUsable(identity); // locked user / resigned staff / missing staff -> 403

  const token = jwt.sign({ userId: identity.userId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
  const permissions = await roleRepository.getPermissionKeysByRoleId(identity.roleId);
  return { token, user: toUserInfo(identity, permissions) };
}

/** `actor` is req.user (already authenticated; permissions loaded from RoleFeatures). */
async function getCurrentUser(actor) {
  const identity = await userRepository.findAuthIdentityByUserId(actor.userId);
  return toUserInfo(identity, actor.permissions);
}

module.exports = { login, getCurrentUser };
