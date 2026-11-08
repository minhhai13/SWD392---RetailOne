// Entity definitions used by UC22-UC26 (one file per table). No ORM/ODM, no SQL.
module.exports = {
  Role: require('./role.model'),
  Feature: require('./feature.model'),
  RoleFeature: require('./roleFeature.model'),
  User: require('./user.model'),
  Staff: require('./staff.model'),
  Supplier: require('./supplier.model'),
  Product: require('./product.model'),
  ProductVariant: require('./productVariant.model'),
  ProductSupplier: require('./productSupplier.model'),
  SupplierProductPrice: require('./supplierProductPrice.model'),
  PurchaseOrder: require('./purchaseOrder.model'),
  PurchaseOrderItem: require('./purchaseOrderItem.model'),
  GoodReceipt: require('./goodReceipt.model'),
  InventoryStock: require('./inventoryStock.model'),
};
