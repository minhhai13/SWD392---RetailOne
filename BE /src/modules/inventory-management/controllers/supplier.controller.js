const supplierService = require('../services/supplier.service');

// Read-only lookups that feed the UC22 form (supplier picker, catalog with current supply prices, UC22.1 low-stock flow).
module.exports.getActiveSuppliers = async (req, res) => {
  const data = await supplierService.getActiveSuppliers();
  res.status(200).json({ success: true, data, message: data.length ? undefined : 'No active suppliers found.' });
};

module.exports.getSupplierCatalog = async (req, res) => {
  const data = await supplierService.getSupplierCatalog(req.params.id);
  res.status(200).json({
    success: true,
    data,
    message: data.items.length ? undefined : 'This supplier has no mapped products. Select another supplier or cancel.',
  });
};

module.exports.getSuppliersForVariants = async (req, res) => {
  const data = await supplierService.getSuppliersForVariants(req.query.variantIds);
  res.status(200).json({
    success: true,
    data,
    message: data.suppliers.length ? undefined : 'No active supplier provides the selected products.',
  });
};
