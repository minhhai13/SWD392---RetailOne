import { Button, Modal, Spinner } from 'react-bootstrap'

/** Generic confirmation dialog (keyboard + focus handled by react-bootstrap Modal). */
export default function ConfirmModal({ show, title, children, confirmText = 'Xác nhận', cancelText = 'Hủy', variant = 'primary', loading = false, onConfirm, onHide }) {
  return (
    <Modal show={show} onHide={loading ? undefined : onHide} centered backdrop={loading ? 'static' : true}>
      <Modal.Header closeButton={!loading}>
        <Modal.Title as="h2" className="h5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={loading}>
          {loading && <Spinner as="span" animation="border" size="sm" className="me-2" />}
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
