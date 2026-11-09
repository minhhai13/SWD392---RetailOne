import { useRef, useState } from 'react'
import { Alert, Form } from 'react-bootstrap'
import { purchaseOrderApi } from '../services/purchaseOrderApi'
import { classifyActionError } from '../utils/actionErrors'
import { getErrorMessage } from '../../../shared/utils/errorMessages'
import { formatVnd } from '../../../shared/utils/format'
import { LIMITS, validateCancelReason } from '../utils/validators'
import ConfirmModal from '../../../shared/components/ConfirmModal'
import { useToast } from '../../../shared/components/ToastProvider'

/** UC26 - Cancel confirmation with a mandatory reason (trimmed, at most 500 characters). */
export default function CancelModal({ po, show, onHide, onDone, onStale }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)

  const fieldError = validateCancelReason(reason)
  const showFieldError = touched && fieldError

  const confirm = async () => {
    if (inFlight.current) return
    setTouched(true)
    if (fieldError) return
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await purchaseOrderApi.cancel(po.id, reason.trim())
      onDone(res)
    } catch (err) {
      const outcome = classifyActionError(err)
      if (outcome.close) {
        toast[outcome.variant](getErrorMessage(err))
        onHide()
        if (outcome.reload) onStale()
      } else {
        setError(err)
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <ConfirmModal show={show} title="Hủy đơn mua hàng" confirmText="Xác nhận hủy đơn" cancelText="Đóng" variant="danger" loading={submitting} onConfirm={confirm} onHide={onHide}>
      <p>
        Hủy đơn <strong>{po.poCode}</strong> của <strong>{po.supplier?.name}</strong> (tổng <span className="money">{formatVnd(po.totalAmount)}</span>). Đơn đã hủy bị khóa vĩnh viễn, không thể mở lại hoặc nhận hàng.
      </p>
      <Form.Group controlId="cancel-reason">
        <Form.Label>
          Lý do hủy <span className="text-danger">*</span>
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          isInvalid={!!showFieldError}
          disabled={submitting}
          aria-describedby="cancel-reason-count"
          placeholder="VD: Nhà cung cấp không giao được hàng"
        />
        <div className="d-flex justify-content-between mt-1">
          <Form.Control.Feedback type="invalid" className="d-block w-auto">
            {showFieldError || ''}
          </Form.Control.Feedback>
          <small id="cancel-reason-count" className={`ms-auto ${reason.length > LIMITS.MAX_CANCEL_REASON ? 'text-danger' : 'text-muted'}`} data-testid="reason-count">
            {reason.length}/{LIMITS.MAX_CANCEL_REASON}
          </small>
        </div>
      </Form.Group>
      {po.status === 'APPROVED' && <p className="small text-muted mt-2 mb-0">Nếu đơn đã gửi cho nhà cung cấp, hãy thông báo hủy đơn cho họ bên ngoài hệ thống.</p>}
      {error && (
        <Alert variant="danger" className="mt-3 mb-0" role="alert">
          {getErrorMessage(error)}
        </Alert>
      )}
    </ConfirmModal>
  )
}
