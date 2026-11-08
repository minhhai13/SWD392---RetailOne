const { sql, newRequest } = require('../config/database');
const { PO_STATUS, PO_SORT_COLUMNS } = require('../constants/purchaseOrder');
const { LIMITS } = require('../constants/purchaseOrder');
const { fromDbId } = require('../utils/ids');

/* Every statement is parameterized. Computed columns (poCode, total, receivedTotal) are only ever SELECTed / OUTPUTted. */

/** UML PurchaseOrderRepository.createPurchaseOrder: header row, snapshot of the supplier, status PENDING. */
async function createPurchaseOrder({ supplier, note, createdBy }, executor) {
  const result = await newRequest(executor)
    .input('supplierId', sql.Int, supplier.id)
    .input('supplierName', sql.NVarChar(255), supplier.name)
    .input('supplierTaxId', sql.VarChar(20), supplier.taxId)
    .input('supplierPhone', sql.VarChar(20), supplier.phoneNumber)
    .input('supplierAddress', sql.NVarChar(255), supplier.address)
    .input('status', sql.VarChar(20), PO_STATUS.PENDING)
    .input('note', sql.NVarChar(sql.MAX), note)
    .input('createdBy', sql.BigInt, createdBy).query(`
      INSERT INTO dbo.PurchaseOrders (supplierId, supplierName, supplierTaxId, supplierPhone, supplierAddress, status, note, createdBy)
      OUTPUT INSERTED.id, INSERTED.poCode
      VALUES (@supplierId, @supplierName, @supplierTaxId, @supplierPhone, @supplierAddress, @status, @note, @createdBy)`);
  return result.recordset[0];
}

/** All items in ONE statement, so either every line is stored or none. */
async function insertItems(poId, items, executor) {
  const request = newRequest(executor).input('poId', sql.Int, poId);
  const rows = items.map((item, i) => {
    request.input(`v${i}`, sql.Int, item.variantId);
    request.input(`q${i}`, sql.Decimal(15, 3), item.quantity);
    request.input(`c${i}`, sql.Decimal(15, 2), item.costPrice);
    request.input(`n${i}`, sql.NVarChar(500), item.note);
    return `(@poId, @v${i}, @q${i}, @c${i}, @n${i})`;
  });
  await request.query(`INSERT INTO dbo.PurchaseOrderItems (poId, variantId, quantity, costPrice, note) VALUES ${rows.join(',')}`);
}

/**
 * totalAmount = SUM of the computed `total` column (quantity * costPrice), calculated by SQL Server.
 * The INDEX hint forces a seek on UQ_POI_PoVariant (poId, variantId): without it the optimizer may scan the whole
 * clustered index and block on - or deadlock with - uncommitted item rows of OTHER purchase orders being created
 * concurrently (observed with 4 parallel creates). A seek only touches this PO's own rows.
 */
async function recalculateTotal(poId, executor) {
  const result = await newRequest(executor).input('poId', sql.Int, poId).query(`
    UPDATE dbo.PurchaseOrders
    SET totalAmount = (SELECT COALESCE(SUM(i.total), 0) FROM dbo.PurchaseOrderItems i WITH (INDEX (UQ_POI_PoVariant)) WHERE i.poId = @poId)
    OUTPUT INSERTED.totalAmount
    WHERE id = @poId`);
  return result.recordset[0].totalAmount;
}

const escapeLike = (text) => text.replace(/[\\%_[]/g, (c) => `\\${c}`);

function applyFilters(request, filters) {
  const where = [];
  if (filters.status) {
    request.input('status', sql.VarChar(20), filters.status);
    where.push('po.status = @status');
  }
  if (filters.from) {
    request.input('from', sql.VarChar(10), filters.from);
    where.push('po.createdAt >= CAST(@from AS DATE)');
  }
  if (filters.to) {
    request.input('to', sql.VarChar(10), filters.to);
    where.push('po.createdAt < DATEADD(DAY, 1, CAST(@to AS DATE))');
  }
  if (filters.q) {
    request.input('qLike', sql.NVarChar(300), `%${escapeLike(filters.q)}%`);
    const parts = ["po.poCode LIKE @qLike ESCAPE '\\'", "po.supplierName LIKE @qLike ESCAPE '\\'"];
    const idMatch = /^(?:PO-?)?0*(\d{1,10})$/i.exec(filters.q);
    if (idMatch && Number(idMatch[1]) <= LIMITS.MAX_INT) {
      request.input('qId', sql.Int, Number(idMatch[1]));
      parts.push('po.id = @qId');
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

/** UC23. Sort column/direction come from a whitelist; id DESC is the tie-break so paging is stable. */
async function getPurchaseOrders(filters, executor) {
  const orderColumn = PO_SORT_COLUMNS[filters.sortBy];
  const direction = filters.sortDir === 'asc' ? 'ASC' : 'DESC';

  const countRequest = newRequest(executor);
  const countWhere = applyFilters(countRequest, filters);
  const total = (await countRequest.query(`SELECT COUNT(*) AS total FROM dbo.PurchaseOrders po ${countWhere}`)).recordset[0].total;

  const listRequest = newRequest(executor);
  const listWhere = applyFilters(listRequest, filters);
  listRequest.input('offset', sql.Int, (filters.page - 1) * filters.pageSize);
  listRequest.input('limit', sql.Int, filters.pageSize);
  const rows = (
    await listRequest.query(`
      SELECT po.id, po.poCode, po.createdAt, po.supplierId, po.supplierName, po.status, po.totalAmount,
             po.createdBy, s.fullName AS createdByName,
             (SELECT COUNT(*) FROM dbo.PurchaseOrderItems i WHERE i.poId = po.id) AS itemCount
      FROM dbo.PurchaseOrders po
      JOIN dbo.Staff s ON s.id = po.createdBy
      ${listWhere}
      ORDER BY ${orderColumn} ${direction}, po.id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`)
  ).recordset;
  return { rows, total };
}

/** UC24 (read-only): header with supplier snapshot, items, and the goods receipt (if any) for the timeline. */
async function getPurchaseOrderDetail(id, executor) {
  const header = (
    await newRequest(executor).input('id', sql.Int, id).query(`
      SELECT po.id, po.poCode, po.status, po.totalAmount, po.note,
             po.supplierId, po.supplierName, po.supplierTaxId, po.supplierPhone, po.supplierAddress,
             po.createdBy, cs.fullName AS createdByName, po.createdAt,
             po.approvedBy, ap.fullName AS approvedByName, po.approvedAt,
             po.canceledBy, ca.fullName AS canceledByName, po.canceledAt, po.cancelReason
      FROM dbo.PurchaseOrders po
      JOIN dbo.Staff cs ON cs.id = po.createdBy
      LEFT JOIN dbo.Staff ap ON ap.id = po.approvedBy
      LEFT JOIN dbo.Staff ca ON ca.id = po.canceledBy
      WHERE po.id = @id`)
  ).recordset[0];
  if (!header) return null;

  const items = (
    await newRequest(executor).input('id', sql.Int, id).query(`
      SELECT i.id, i.variantId, v.productId, p.code AS productCode, p.name AS productName, v.unitName, v.conversionFactor,
             i.quantity, i.costPrice, i.total, i.receivedQuantity, i.note
      FROM dbo.PurchaseOrderItems i
      JOIN dbo.ProductVariants v ON v.id = i.variantId
      JOIN dbo.Products p ON p.id = v.productId
      WHERE i.poId = @id
      ORDER BY i.id`)
  ).recordset;

  const receipt =
    (
      await newRequest(executor).input('id', sql.Int, id).query(`
        SELECT gr.id, gr.receiptCode, gr.receivedAt, gr.receivedBy, rs.fullName AS receivedByName
        FROM dbo.GoodReceipts gr
        JOIN dbo.Staff rs ON rs.id = gr.receivedBy
        WHERE gr.poId = @id`)
    ).recordset[0] || null;

  return { header, items, receipt };
}

/** Locks the PO row (update lock + range lock) until the transaction ends: serializes concurrent approve/cancel. */
async function getPurchaseOrderForUpdate(id, executor) {
  const row = (
    await newRequest(executor)
      .input('id', sql.Int, id)
      .query('SELECT id, status, supplierId FROM dbo.PurchaseOrders WITH (UPDLOCK, HOLDLOCK) WHERE id = @id')
  ).recordset[0];
  return row || null;
}

/** Products of the PO lines (shared range lock until commit) so UC25 can verify they are still 'Selling'. */
async function getOrderedProducts(poId, executor) {
  const result = await newRequest(executor).input('poId', sql.Int, poId).query(`
    SELECT DISTINCT p.id, p.code, p.name, p.status
    FROM dbo.PurchaseOrderItems i
    JOIN dbo.ProductVariants v ON v.id = i.variantId
    JOIN dbo.Products AS p WITH (HOLDLOCK) ON p.id = v.productId
    WHERE i.poId = @poId`);
  return result.recordset.map((row) => ({ ...row, id: fromDbId(row.id) }));
}

/**
 * Read-only dependency of UC26 (not UC31): is there a goods receipt for this PO?
 * HOLDLOCK takes a key-range lock on UQ_GR_Po, so a receipt being inserted concurrently either commits first
 * (and is seen here) or waits until this transaction finishes.
 */
async function hasGoodReceipt(poId, executor) {
  const result = await newRequest(executor)
    .input('poId', sql.Int, poId)
    .query('SELECT TOP 1 id FROM dbo.GoodReceipts WITH (HOLDLOCK) WHERE poId = @poId');
  return result.recordset.length > 0;
}

/**
 * UML PurchaseOrderRepository.updatePurchaseOrderStatus. The status condition lives IN the UPDATE, and the result is
 * the number of rows changed, so a PO whose status was changed by another request is never overwritten.
 *  - toStatus APPROVED: only from PENDING; records approvedBy/approvedAt (CK_PO_ApprovalInfo).
 *  - toStatus CANCELED: only from PENDING/APPROVED and only if no goods receipt exists; records canceledBy/canceledAt/
 *    cancelReason (CK_PO_CancelInfo).
 * @returns {Promise<boolean>} true when exactly one row was updated
 */
async function updatePurchaseOrderStatus(id, { toStatus, processedBy, reason }, executor) {
  const request = newRequest(executor)
    .input('id', sql.Int, id)
    .input('toStatus', sql.VarChar(20), toStatus)
    .input('processedBy', sql.BigInt, processedBy);

  let statement;
  if (toStatus === PO_STATUS.APPROVED) {
    request.input('fromStatus', sql.VarChar(20), PO_STATUS.PENDING);
    statement = `
      UPDATE dbo.PurchaseOrders
      SET status = @toStatus, approvedBy = @processedBy, approvedAt = SYSDATETIME()
      WHERE id = @id AND status = @fromStatus`;
  } else if (toStatus === PO_STATUS.CANCELED) {
    request.input('reason', sql.NVarChar(500), reason);
    request.input('fromA', sql.VarChar(20), PO_STATUS.PENDING);
    request.input('fromB', sql.VarChar(20), PO_STATUS.APPROVED);
    statement = `
      UPDATE dbo.PurchaseOrders
      SET status = @toStatus, canceledBy = @processedBy, canceledAt = SYSDATETIME(), cancelReason = @reason
      WHERE id = @id AND status IN (@fromA, @fromB)
        AND NOT EXISTS (SELECT 1 FROM dbo.GoodReceipts g WHERE g.poId = @id)`;
  } else {
    throw new Error(`Unsupported target status ${toStatus}`);
  }
  const result = await request.query(statement);
  return result.rowsAffected[0] === 1;
}

module.exports = {
  createPurchaseOrder,
  insertItems,
  recalculateTotal,
  getPurchaseOrders,
  getPurchaseOrderDetail,
  getPurchaseOrderForUpdate,
  getOrderedProducts,
  hasGoodReceipt,
  updatePurchaseOrderStatus,
};
