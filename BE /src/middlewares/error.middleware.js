const { toAppError, logError, isDriverError } = require('../utils/errors');

const notFoundHandler = (req, res) =>
  res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: 'Route not found.' });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const appError = toAppError(err);
  if (appError.status >= 500 || isDriverError(err)) logError(err); // also log lock/deadlock/constraint errors mapped to 4xx
  const body = { success: false, code: appError.code, message: appError.message };
  if (appError.details !== undefined) body.details = appError.details;
  res.status(appError.status).json(body);
};

module.exports = { notFoundHandler, errorHandler };
