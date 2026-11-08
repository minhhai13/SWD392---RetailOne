const express = require('express');
const router = express.Router();
const purchaseOrderController = require('../controllers/purchaseOrder.controller');
const supplierController = require('../controllers/supplier.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizePermission } = require('../middlewares/permission.middleware');
const { PERMISSIONS } = require('../constants/permissions');

// Procurement endpoints only (UC22-UC26). Every route is authenticated and permission-checked (Features/RoleFeatures)
// BEFORE any data access.
const can = PERMISSIONS;

router.use(authenticate);

// UC22 / UC22.1 lookups (read-only) - same permission as creating a PO
router.get('/suppliers', authorizePermission(can.CREATE_PURCHASE_ORDER), supplierController.getActiveSuppliers);
router.get('/suppliers/by-variants', authorizePermission(can.CREATE_PURCHASE_ORDER), supplierController.getSuppliersForVariants);
router.get('/suppliers/:id/products', authorizePermission(can.CREATE_PURCHASE_ORDER), supplierController.getSupplierCatalog);

router.post('/purchase-orders', authorizePermission(can.CREATE_PURCHASE_ORDER), purchaseOrderController.createPurchaseOrder); // UC22
router.get('/purchase-orders', authorizePermission(can.VIEW_PURCHASE_ORDER), purchaseOrderController.getPurchaseOrders); // UC23
router.get('/purchase-orders/:id', authorizePermission(can.VIEW_PURCHASE_ORDER), purchaseOrderController.getPurchaseOrderDetail); // UC24
router.patch('/purchase-orders/:id/approve', authorizePermission(can.APPROVE_PURCHASE_ORDER), purchaseOrderController.approvePurchaseOrder); // UC25
router.patch('/purchase-orders/:id/cancel', authorizePermission(can.CANCEL_PURCHASE_ORDER), purchaseOrderController.cancelPurchaseOrder); // UC26

module.exports = router;
