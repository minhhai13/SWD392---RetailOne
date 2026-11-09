// Entity definitions used by UC22-UC26 (one file per table). No ORM/ODM, no SQL.
module.exports = {
  Role: require('../../modules/auth/models/role.model'),
  Feature: require('../../modules/auth/models/feature.model'),
  RoleFeature: require('../../modules/auth/models/roleFeature.model'),
  User: require('../../modules/auth/models/user.model'),
  Staff: require('../../modules/auth/models/staff.model'),
  Supplier: require('../../modules/inventory-management/models/supplier.model'),
  Product: require('../../modules/inventory-management/models/product.model'),
  ProductVariant: require('../../modules/inventory-management/models/productVariant.model'),
  ProductSupplier: require('../../modules/inventory-management/models/productSupplier.model'),
  SupplierProductPrice: require('../../modules/inventory-management/models/supplierProductPrice.model'),
  PurchaseOrder: require('../../modules/inventory-management/models/purchaseOrder.model'),
  PurchaseOrderItem: require('../../modules/inventory-management/models/purchaseOrderItem.model'),
  GoodReceipt: require('../../modules/inventory-management/models/goodReceipt.model'),
  InventoryStock: require('../../modules/inventory-management/models/inventoryStock.model'),
};
