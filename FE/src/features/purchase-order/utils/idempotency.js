/** Idempotency-Key: 8-128 chars of letters, digits, "-" or "_" (backend validator). */
export const generateIdempotencyKey = () => {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `po-${random}`
}

export const isValidIdempotencyKey = (key) => /^[A-Za-z0-9_-]{8,128}$/.test(key)
