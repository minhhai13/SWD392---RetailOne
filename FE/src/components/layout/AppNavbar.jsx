import { Badge, Button, Navbar } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'

export default function AppNavbar({ onMenu }) {
  const { user, logout } = useAuth()
  return (
    <Navbar bg="dark" variant="dark" className="px-3 app-navbar" sticky="top">
      <Button variant="outline-light" size="sm" className="d-lg-none me-2" onClick={onMenu} aria-label="Mở menu">
        <i className="bi bi-list" aria-hidden="true" />
      </Button>
      <Navbar.Brand as={Link} to="/" className="fw-bold">
        <i className="bi bi-shop me-2" aria-hidden="true" />
        RetailOne
      </Navbar.Brand>
      <div className="ms-auto d-flex align-items-center gap-3">
        <div className="text-end text-white lh-sm d-none d-sm-block" data-testid="user-info">
          <div className="fw-semibold">{user?.fullName}</div>
          <Badge bg="info" text="dark">
            {user?.role?.name}
          </Badge>
        </div>
        <Badge bg="info" text="dark" className="d-sm-none">
          {user?.role?.name}
        </Badge>
        <Button variant="outline-light" size="sm" onClick={logout} className="text-nowrap" aria-label="Đăng xuất">
          <i className="bi bi-box-arrow-right me-sm-1" aria-hidden="true" />
          <span className="d-none d-sm-inline">Đăng xuất</span>
        </Button>
      </div>
    </Navbar>
  )
}
