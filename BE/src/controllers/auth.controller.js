const authService = require('../services/auth.service');

module.exports.login = async (req, res) => {
  const data = await authService.login(req.body);
  res.status(200).json({ success: true, data, message: 'Login successful.' });
};

module.exports.me = async (req, res) => {
  const data = await authService.getCurrentUser(req.user);
  res.status(200).json({ success: true, data });
};

// JWT is stateless: the client discards the token. Kept for frontend compatibility with the legacy API.
module.exports.logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out.' });
};
