import { useRef, useState } from 'react'
import { Alert, ListGroup } from 'react-bootstrap'
import { purchaseOrderApi } from '../../api/purchaseOrderApi'
import { classifyActionError } from '../../utils/actionErrors'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatVnd } from '../../utils/format'
import ConfirmModal from '../common/ConfirmModal'
import { useToast } from '../common/ToastProvider'

/** UC25 - Approve confirmation. Sends no body: the approver is the authenticated staff (token). */
export default function ApproveModal({ po, show, onHide, onDone, onStale }) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const inFlight = useRef(false) // blocks a double submit even before React re-renders

  const confirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await purchaseOrderApi.approve(po.id)
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
    <ConfirmModal show={show} title="Duyệt đơn mua hàng" confirmText="Xác nhận duyệt" variant="success" loading={submitting} onConfirm={confirm} onHide={onHide}>
      <p>Bạn có chắc chắn muốn duyệt đơn mua hàng này không?</p>
      <ListGroup variant="flush" className="mb-2">
        <ListGroup.Item className="d-flex justify-content-between px-0">
          <span className="text-muted">Mã đơn</span>
          <strong>{po.poCode}</strong>
        </ListGroup.Item>
        <ListGroup.Item className="d-flex justify-content-between px-0">
          <span className="text-muted">Nhà cung cấp</span>
          <strong>{po.supplier?.name}</strong>
        </ListGroup.Item>
        <ListGroup.Item className="d-flex justify-content-between px-0">
          <span className="text-muted">Tổng tiền</span>
          <strong className="money">{formatVnd(po.totalAmount)}</strong>
        </ListGroup.Item>
      </ListGroup>
      <p className="small text-muted mb-0">Sau khi duyệt, đơn đủ điều kiện để nhận hàng. Tồn kho không thay đổi ở bước này.</p>
      {error && (
        <Alert variant="danger" className="mt-3 mb-0" role="alert">
          {getErrorMessage(error)}
        </Alert>
      )}
    </ConfirmModal>
  )
}
