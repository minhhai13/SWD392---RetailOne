import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap'
import { Link, useBlocker, useNavigate } from 'react-router-dom'
import { purchaseOrderApi } from '../api/purchaseOrderApi'
import { supplierApi } from '../api/supplierApi'
import ConfirmModal from '../components/common/ConfirmModal'
import EmptyState from '../components/common/EmptyState'
import PageHeader from '../components/common/PageHeader'
import { useToast } from '../components/common/ToastProvider'
import CatalogPicker from '../components/purchaseOrder/CatalogPicker'
import DraftItemsTable from '../components/purchaseOrder/DraftItemsTable'
import SupplierSelect from '../components/purchaseOrder/SupplierSelect'
import { useAsync } from '../hooks/useAsync'
import { draftReducer, initialDraft, isDirty } from '../utils/draftReducer'
import { getErrorMessage, isCommitUnknown, isOutcomeUnknown } from '../utils/errorMessages'
import { formatVnd } from '../utils/format'
import { generateIdempotencyKey } from '../utils/idempotency'
import { buildCreatePayload } from '../utils/poPayload'
import { LIMITS, previewTotal, validateDraft } from '../utils/validators'

/** UC22 - Create Purchase Order (+ alternative flows 22.2 edit draft, 22.3 cancel). */
export default function CreatePurchaseOrderPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [draft, dispatch] = useReducer(draftReducer, initialDraft)
  const [pendingSupplier, setPendingSupplier] = useState(undefined) // supplier change waiting for confirmation
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [verified, setVerified] = useState(false) // user confirmed they checked the list after COMMIT_OUTCOME_UNKNOWN
  const inFlight = useRef(false)
  const finished = useRef(false)
  const keyRef = useRef(null) // { key, fingerprint } for Idempotency-Key

  const suppliers = useAsync((signal) => supplierApi.listSuppliers(signal), [])
  const catalog = useAsync((signal) => supplierApi.getCatalog(draft.supplierId, signal), [draft.supplierId], { enabled: Boolean(draft.supplierId) })

  const dirty = isDirty(draft)
  const errors = useMemo(() => validateDraft(draft), [draft])
  const total = previewTotal(draft.items)
  const addedIds = useMemo(() => new Set(draft.items.map((i) => i.variantId)), [draft.items])
  const blocksSubmit = isCommitUnknown(submitError) && !verified

  // 22.3: leaving with a changed draft asks for confirmation (in-app navigation and tab close)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !finished.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const onSupplierChange = (id) => {
    if (id === draft.supplierId) return
    if (draft.items.length > 0) setPendingSupplier(id) // confirm before dropping the current items
    else dispatch({ type: 'setSupplier', supplierId: id })
  }

  const onAdd = useCallback((item) => dispatch({ type: 'addItem', item: { variantId: item.variantId, productName: item.productName, productCode: item.productCode, unitName: item.unitName, supplyPrice: item.supplyPrice } }), [])

  const submit = async () => {
    if (inFlight.current) return
    setShowErrors(true)
    if (!errors.valid) return
    const payload = buildCreatePayload(draft)
    const fingerprint = JSON.stringify(payload)
    // same payload => same key (a retry cannot create a second PO); changed payload => new key
    if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) keyRef.current = { key: generateIdempotencyKey(), fingerprint }
    inFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await purchaseOrderApi.create(payload, keyRef.current.key)
      finished.current = true // let the router leave without the "unsaved draft" prompt
      keyRef.current = null
      const code = res.data?.poCode
      if (res.status === 200) toast.info(`Yêu cầu này đã được xử lý trước đó. Đây là đơn ${code || ''} đã tạo.`, 'Đã tạo trước đó')
      else toast.success(`Đã tạo đơn mua hàng ${code || ''} ở trạng thái chờ duyệt.`)
      if (res.meta?.detailLoaded === false) toast.info('Đơn đã được lưu nhưng chưa tải được chi tiết. Đang mở trang chi tiết...')
      navigate(`/purchase-orders/${res.data.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err) // the draft is kept so the user can fix it
      setVerified(false)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const affectedNames = (submitError?.details?.variantIds || []).map((id) => draft.items.find((i) => i.variantId === id)).filter(Boolean)
  const unknown = isOutcomeUnknown(submitError)

  return (
    <>
      <PageHeader title="Tạo đơn mua hàng" subtitle="Chọn nhà cung cấp, thêm sản phẩm và số lượng. Giá mua và tổng tiền do hệ thống tính khi lưu." />

      <Row className="g-3">
        <Col xs={12}>
          <Card>
            <Card.Header className="bg-white fw-semibold">1. Nhà cung cấp</Card.Header>
            <Card.Body>
              <SupplierSelect suppliers={suppliers} value={draft.supplierId} onChange={onSupplierChange} disabled={submitting} />
            </Card.Body>
          </Card>
        </Col>

        {draft.supplierId && (
          <Col xs={12}>
            <Card>
              <Card.Header className="bg-white fw-semibold">2. Chọn sản phẩm</Card.Header>
              <Card.Body>
                <CatalogPicker catalog={catalog} addedIds={addedIds} onAdd={onAdd} />
              </Card.Body>
            </Card>
          </Col>
        )}

        {draft.supplierId && (
          <Col xs={12}>
            <Card>
              <Card.Header className="bg-white fw-semibold">3. Các dòng hàng ({draft.items.length})</Card.Header>
              <Card.Body className={draft.items.length ? 'p-0' : ''}>
                {draft.items.length === 0 ? (
                  <EmptyState icon="bi-cart" title="Chưa có sản phẩm nào" description="Hãy thêm sản phẩm từ danh mục ở trên." />
                ) : (
                  <DraftItemsTable items={draft.items} errors={errors} showErrors={showErrors} dispatch={dispatch} />
                )}
              </Card.Body>
            </Card>
          </Col>
        )}

        <Col xs={12}>
          <Card>
            <Card.Header className="bg-white fw-semibold">Thông tin đơn và xác nhận</Card.Header>
            <Card.Body>
              <Form.Group controlId="po-note" className="mb-3">
                <Form.Label>Ghi chú đơn (tùy chọn)</Form.Label>
                <Form.Control as="textarea" rows={2} value={draft.note} onChange={(e) => dispatch({ type: 'setNote', value: e.target.value })} isInvalid={!!errors.note} disabled={submitting} />
                <Form.Control.Feedback type="invalid">{errors.note}</Form.Control.Feedback>
                <div className="small text-muted text-end">
                  {draft.note.length}/{LIMITS.MAX_PO_NOTE}
                </div>
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center border-top pt-3 mb-3">
                <span className="fs-6">Tổng tiền tạm tính</span>
                <span className="fs-4 fw-bold money" data-testid="preview-total">
                  {formatVnd(total)}
                </span>
              </div>
              <div className="small text-muted mb-3">Chỉ để tham khảo. Giá mua và tổng tiền cuối cùng do hệ thống quyết định khi lưu đơn.</div>

              {showErrors && errors.form && (
                <Alert variant="warning" role="alert">
                  {errors.form}
                </Alert>
              )}

              {submitError && (
                <Alert variant={unknown ? 'warning' : 'danger'} role="alert" data-testid="submit-error">
                  <strong>{unknown ? 'Chưa xác định được kết quả. ' : 'Không tạo được đơn. '}</strong>
                  {getErrorMessage(submitError)}
                  {affectedNames.length > 0 && (
                    <ul className="mb-0 mt-2">
                      {affectedNames.map((i) => (
                        <li key={i.variantId}>
                          {i.productName} ({i.unitName})
                        </li>
                      ))}
                    </ul>
                  )}
                  {unknown && (
                    <div className="mt-2">
                      Hệ thống <strong>không tự gửi lại</strong> yêu cầu. Hãy kiểm tra{' '}
                      <Link to="/purchase-orders" target="_blank" rel="noopener noreferrer">
                        danh sách đơn mua hàng
                      </Link>{' '}
                      trước khi tạo lại.
                      {!isCommitUnknown(submitError) && ' Nếu bấm tạo lại, yêu cầu dùng cùng khóa chống tạo trùng nên sẽ không sinh thêm đơn nếu lần trước đã thành công.'}
                      {isCommitUnknown(submitError) && (
                        <Form.Check className="mt-2" id="verified" type="checkbox" label="Tôi đã kiểm tra danh sách và đơn này chưa được tạo" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
                      )}
                    </div>
                  )}
                </Alert>
              )}

              <div className="d-flex flex-wrap gap-2 justify-content-end">
                <Button variant="outline-secondary" onClick={() => navigate('/purchase-orders')} disabled={submitting}>
                  Hủy
                </Button>
                <Button variant="primary" onClick={submit} disabled={submitting || blocksSubmit}>
                  {submitting && <Spinner as="span" animation="border" size="sm" className="me-2" />}
                  Tạo đơn mua hàng
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <ConfirmModal
        show={pendingSupplier !== undefined}
        title="Đổi nhà cung cấp?"
        confirmText="Đổi và xóa các dòng hàng"
        variant="warning"
        onHide={() => setPendingSupplier(undefined)}
        onConfirm={() => {
          dispatch({ type: 'setSupplier', supplierId: pendingSupplier })
          setPendingSupplier(undefined)
          setSubmitError(null)
        }}
      >
        Đơn chỉ thuộc một nhà cung cấp. Đổi nhà cung cấp sẽ xóa {draft.items.length} dòng hàng đang soạn.
      </ConfirmModal>

      <ConfirmModal show={blocker.state === 'blocked'} title="Rời khỏi trang tạo đơn?" confirmText="Rời trang" cancelText="Ở lại soạn tiếp" variant="danger" onHide={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()}>
        Đơn đang soạn chưa được lưu và sẽ bị hủy. Hệ thống không lưu bản nháp.
      </ConfirmModal>
    </>
  )
}
