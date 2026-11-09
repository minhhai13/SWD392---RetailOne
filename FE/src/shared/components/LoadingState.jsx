import { Spinner } from 'react-bootstrap'

export default function LoadingState({ text = 'Đang tải dữ liệu...', fullPage = false }) {
  return (
    <div className={`d-flex flex-column align-items-center justify-content-center text-muted ${fullPage ? 'min-vh-100' : 'py-5'}`} role="status" aria-live="polite">
      <Spinner animation="border" variant="primary" className="mb-2" />
      <span>{text}</span>
    </div>
  )
}
