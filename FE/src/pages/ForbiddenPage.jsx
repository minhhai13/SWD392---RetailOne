import { Button } from 'react-bootstrap'
import { useAuth } from '../auth/useAuth'
import EmptyState from '../components/common/EmptyState'

export default function ForbiddenPage() {
  const { user, logout } = useAuth()
  return (
    <EmptyState icon="bi-shield-lock" title="Bạn không đủ quyền truy cập chức năng này" description={`Tài khoản ${user?.fullName || ''} (${user?.role?.name || 'không rõ vai trò'}) không được phép sử dụng quản lý đơn mua hàng.`}>
      <Button variant="outline-primary" onClick={logout}>
        Đăng nhập bằng tài khoản khác
      </Button>
    </EmptyState>
  )
}
