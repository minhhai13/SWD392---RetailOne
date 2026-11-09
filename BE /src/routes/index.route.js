const authRoutes = require('../modules/auth/routes/auth.route');
const inventoryRoutes = require('../modules/inventory-management/routes/inventory.route');
const { ping } = require('../config/database');

module.exports = (app) => {
  const version = '/api';

  app.get(version + '/health', async (req, res) => {
    await ping();
    res.json({ success: true, data: { status: 'ok' } });
  });
  app.use(version + '/auth', authRoutes);
  app.use(version + '/inventory', inventoryRoutes); // procurement only: suppliers lookup + purchase orders
};
