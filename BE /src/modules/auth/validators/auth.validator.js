const { badRequest } = require('../../../utils/errors');
const { isPlainObject } = require('../../inventory-management/validators/common.validator');
const { User } = require('../../../shared/models/index');

function parseLoginInput(body) {
  const { username, password } = isPlainObject(body) ? body : {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > User.maxLength('username')) {
    throw badRequest('VALIDATION_ERROR', 'Username and password are required.');
  }
  return { username: username.trim(), password };
}

module.exports = { parseLoginInput };
