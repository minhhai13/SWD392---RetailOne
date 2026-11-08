import { isOutcomeUnknown } from './errorMessages'

/**
 * How the approve / cancel modals react to a failed PATCH:
 *  - stale   : the PO state changed under us (409/404) -> close the modal, show the error, reload the PO
 *  - unknown : outcome not known (network / timeout / COMMIT_OUTCOME_UNKNOWN) -> close, warn, reload; NEVER auto-retry
 *  - blocked : business/permission refusal (403, 422) -> close and show the error (PO unchanged)
 *  - inline  : keep the modal open and show the error inside it (retry allowed: CONCURRENT_UPDATE, 400, 5xx)
 */
export const classifyActionError = (err) => {
  if (isOutcomeUnknown(err)) return { mode: 'unknown', close: true, reload: true, variant: 'warning' }
  if (err.code === 'CONCURRENT_UPDATE') return { mode: 'inline', close: false, reload: false, variant: 'error' }
  if (err.status === 409 || err.status === 404) return { mode: 'stale', close: true, reload: true, variant: 'error' }
  if (err.status === 403 || err.status === 422) return { mode: 'blocked', close: true, reload: false, variant: 'error' }
  return { mode: 'inline', close: false, reload: false, variant: 'error' }
}
