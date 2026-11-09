import { Button } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'

export default function NotFoundPage() {
  return (
    <div className="container py-5">
      <EmptyState icon="bi-compass" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã bị di chuyển.">
        <Button as={Link} role="link" to="/purchase-orders" variant="primary">
          Về danh sách đơn mua hàng
        </Button>
      </EmptyState>
    </div>
  )
}
