import { useState } from 'react'
import { Alert, Button, Card, Col, Row } from 'react-bootstrap'
import { Link, useLocation, useParams } from 'react-router-dom'
import { purchaseOrderApi } from '../api/purchaseOrderApi'
import { useAuth } from '../auth/useAuth'
import EmptyState from '../components/common/EmptyState'
import ErrorState from '../components/common/ErrorState'
import LoadingState from '../components/common/LoadingState'
import PageHeader from '../components/common/PageHeader'
import StatusBadge from '../components/common/StatusBadge'
import { useToast } from '../components/common/ToastProvider'
import ApproveModal from '../components/purchaseOrder/ApproveModal'
import CancelModal from '../components/purchaseOrder/CancelModal'
import ItemsTable from '../components/purchaseOrder/ItemsTable'
import SupplierInfoCard from '../components/purchaseOrder/SupplierInfoCard'
import Timeline from '../components/purchaseOrder/Timeline'
import { useAsync } from '../hooks/useAsync'
import { formatDateTime, formatStaff, orDash } from '../utils/format'
import { canPerform } from '../utils/permissions'
import { LIST_SEARCH_KEY } from './PurchaseOrderListPage'

const savedListSearch = () => {
  try {
    return sessionStorage.getItem(LIST_SEARCH_KEY) || ''
  } catch {
    return ''
  }
}

/** UC24 - details, with the UC25 (approve) and UC26 (cancel) actions as confirmation modals. */
export default function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const toast = useToast()
  const [modal, setModal] = useState(null) // 'approve' | 'cancel' | null
  const [actionSaved, setActionSaved] = useState(false)

  const { data, error, reload } = useAsync((signal) => purchaseOrderApi.get(id, signal), [id], { keepData: true })
  const po = data?.data
  const backTo = `/purchase-orders${location.state?.fromSearch ?? savedListSearch()}` // UC24.1: back with the same filters

  const onDone = (kind) => (res) => {
    setModal(null)
    setActionSaved(true)
    toast.success(kind === 'approve' ? `Đã duyệt đơn ${po.poCode}.` : `Đã hủy đơn ${po.poCode}.`)
    if (res.meta?.detailLoaded === false) toast.info('Thao tác đã được lưu nhưng chưa tải được chi tiết mới. Đang tải lại...')
    reload() // always re-read the PO after an action
  }

  if (error && !po) {
    const notFound = error.status === 404 || error.code === 'INVALID_ID'
    return (
      <>
        {notFound ? (
          <EmptyState icon="bi-file-earmark-x" title="Không tìm thấy đơn mua hàng" description="Đơn không tồn tại hoặc đã bị xóa.">
            <Button as={Link} role="link" to={backTo} variant="primary">
              Về danh sách đơn mua hàng
            </Button>
          </EmptyState>
        ) : (
          <>
            {actionSaved && <Alert variant="success">Thao tác trước đó đã được lưu thành công nhưng chưa tải được chi tiết mới của đơn.</Alert>}
            <ErrorState error={error} onRetry={reload}>
              <div className="mb-2">
                <Link to={backTo}>← Về danh sách</Link>
              </div>
            </ErrorState>
          </>
        )}
      </>
    )
  }
  if (!po) return <LoadingState text="Đang tải chi tiết đơn..." />

  const canApprove = canPerform(user, po.availableActions, 'APPROVE')
  const canCancel = canPerform(user, po.availableActions, 'CANCEL')

  return (
    <>
      <PageHeader
        title={
          <>
            {po.poCode} <StatusBadge status={po.status} />
          </>
        }
        subtitle={`Tạo lúc ${formatDateTime(po.createdAt)}`}
        actions={
          <>
            <Button as={Link} role="link" to={backTo} variant="outline-secondary">
              <i className="bi bi-arrow-left me-1" aria-hidden="true" />
              Quay lại danh sách
            </Button>
            {canApprove && (
              <Button variant="success" onClick={() => setModal('approve')}>
                <i className="bi bi-check-circle me-1" aria-hidden="true" />
                Duyệt đơn
              </Button>
            )}
            {canCancel && (
              <Button variant="outline-danger" onClick={() => setModal('cancel')}>
                <i className="bi bi-x-circle me-1" aria-hidden="true" />
                Hủy đơn
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorState error={error} onRetry={reload} />}

      {po.status === 'CANCELED' && (
        <Alert variant="danger" data-testid="cancel-info">
          <strong>Đơn đã bị hủy</strong> bởi {formatStaff(po.canceledBy)} lúc {formatDateTime(po.canceledAt)}.
          <div>Lý do: {orDash(po.cancelReason)}</div>
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={6}>
          <Card className="h-100">
            <Card.Header className="bg-white fw-semibold">
              <i className="bi bi-info-circle me-2" aria-hidden="true" />
              Thông tin đơn
            </Card.Header>
            <Card.Body>
              <Row as="dl" className="mb-0">
                <Col sm={4} as="dt" className="text-muted fw-normal">Mã đơn</Col>
                <Col sm={8} as="dd">{po.poCode}</Col>
                <Col sm={4} as="dt" className="text-muted fw-normal">Trạng thái</Col>
                <Col sm={8} as="dd"><StatusBadge status={po.status} /></Col>
                <Col sm={4} as="dt" className="text-muted fw-normal">Ngày tạo</Col>
                <Col sm={8} as="dd">{formatDateTime(po.createdAt)}</Col>
                <Col sm={4} as="dt" className="text-muted fw-normal">Người tạo</Col>
                <Col sm={8} as="dd">{formatStaff(po.createdBy)}</Col>
                {po.approvedBy && (
                  <>
                    <Col sm={4} as="dt" className="text-muted fw-normal">Người duyệt</Col>
                    <Col sm={8} as="dd">{formatStaff(po.approvedBy)} · {formatDateTime(po.approvedAt)}</Col>
                  </>
                )}
                <Col sm={4} as="dt" className="text-muted fw-normal">Ghi chú</Col>
                <Col sm={8} as="dd" className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{orDash(po.note)}</Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <SupplierInfoCard supplier={po.supplier} />
        </Col>
        <Col xs={12}>
          <Card>
            <Card.Header className="bg-white fw-semibold">
              <i className="bi bi-box-seam me-2" aria-hidden="true" />
              Sản phẩm đặt mua ({po.items.length})
            </Card.Header>
            <Card.Body className="p-0">
              <ItemsTable items={po.items} totalAmount={po.totalAmount} />
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12}>
          <Card>
            <Card.Header className="bg-white fw-semibold">
              <i className="bi bi-clock-history me-2" aria-hidden="true" />
              Dòng thời gian
            </Card.Header>
            <Card.Body>
              <Timeline timeline={po.timeline} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {canApprove && <ApproveModal po={po} show={modal === 'approve'} onHide={() => setModal(null)} onDone={onDone('approve')} onStale={reload} />}
      {canCancel && <CancelModal key={po.status} po={po} show={modal === 'cancel'} onHide={() => setModal(null)} onDone={onDone('cancel')} onStale={reload} />}
    </>
  )
}
