const purchaseOrderService = require('../services/InventoryServices/purchaseOrder.service');
const { parseIdempotencyKey } = require('../validators/purchaseOrder.validator');

// Controllers only translate HTTP <-> service calls. The acting staff comes from the verified token (req.user),
// never from the request body.
const COMMITTED_NOTE = ' The change was saved, but the full details could not be loaded; call GET /purchase-orders/:id.';

/** Additive meta: present only when the write committed but the follow-up read failed. */
const metaFor = (detailLoaded) => (detailLoaded ? undefined : { detailLoaded: false });

module.exports.createPurchaseOrder = async (req, res) => {
  const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
  const { purchaseOrder, detailLoaded, replay } = await purchaseOrderService.createPurchaseOrder(req.user, req.body, { idempotencyKey });
  if (replay) res.set('Idempotent-Replay', 'true');
  const message = replay
    ? 'This request was already processed; returning the purchase order created earlier.'
    : 'Purchase order created with status PENDING.';
  res.status(replay ? 200 : 201).json({
    success: true,
    data: purchaseOrder,
    message: detailLoaded ? message : message + COMMITTED_NOTE,
    meta: metaFor(detailLoaded),
  });
};

module.exports.getPurchaseOrders = async (req, res) => {
  const data = await purchaseOrderService.getPurchaseOrders(req.user, req.query);
  res.status(200).json({ success: true, data, message: data.items.length ? undefined : 'No matching purchase orders found' });
};

module.exports.getPurchaseOrderDetail = async (req, res) => {
  const data = await purchaseOrderService.getPurchaseOrderDetail(req.user, req.params.id);
  res.status(200).json({ success: true, data });
};

module.exports.approvePurchaseOrder = async (req, res) => {
  const { purchaseOrder, detailLoaded } = await purchaseOrderService.approvePurchaseOrder(req.user, req.params.id);
  res.status(200).json({
    success: true,
    data: purchaseOrder,
    message: detailLoaded ? 'Purchase order approved.' : 'Purchase order approved.' + COMMITTED_NOTE,
    meta: metaFor(detailLoaded),
  });
};

module.exports.cancelPurchaseOrder = async (req, res) => {
  const { purchaseOrder, detailLoaded } = await purchaseOrderService.cancelPurchaseOrder(req.user, req.params.id, req.body);
  res.status(200).json({
    success: true,
    data: purchaseOrder,
    message: detailLoaded ? 'Purchase order canceled.' : 'Purchase order canceled.' + COMMITTED_NOTE,
    meta: metaFor(detailLoaded),
  });
};
