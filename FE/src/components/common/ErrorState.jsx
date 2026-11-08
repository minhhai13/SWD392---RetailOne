import { Alert, Button } from 'react-bootstrap'
import { getErrorMessage } from '../../utils/errorMessages'

export default function ErrorState({ error, message, onRetry, children }) {
  return (
    <Alert variant="danger" className="my-3" data-testid="error-state">
      <Alert.Heading as="h2" className="h6">
        <i className="bi bi-exclamation-octagon me-2" aria-hidden="true" />
        Không tải được dữ liệu
      </Alert.Heading>
      <p className="mb-2">{message || getErrorMessage(error)}</p>
      {children}
      {onRetry && (
        <Button variant="outline-danger" size="sm" onClick={onRetry}>
          <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
          Thử lại
        </Button>
      )}
    </Alert>
  )
}
