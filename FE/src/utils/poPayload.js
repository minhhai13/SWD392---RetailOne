/**
 * Builds the UC22 request body. Only fields the backend accepts from a client are included:
 * never costPrice, total, totalAmount, poCode, status, createdBy, approvedBy, managerId, supplier snapshot.
 */
export const buildCreatePayload = (draft) => {
  const payload = {
    supplierId: Number(draft.supplierId),
    items: draft.items.map((item) => {
      const line = { variantId: Number(item.variantId), quantity: Number(String(item.quantity).trim()) }
      const note = (item.note ?? '').trim()
      if (note) line.note = note
      return line
    }),
  }
  const note = (draft.note ?? '').trim()
  if (note) payload.note = note
  return payload
}
