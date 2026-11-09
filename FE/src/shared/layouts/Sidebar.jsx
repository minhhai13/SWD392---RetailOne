import { Nav, Offcanvas } from 'react-bootstrap'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { PERMISSIONS } from '../../features/auth/utils/permissions'

/** Fixed sidebar on large screens, off-canvas menu below `lg`. Only links to implemented screens. */
export default function Sidebar({ show, onHide }) {
  const { can } = useAuth()
  const { pathname } = useLocation()
  const listActive = pathname.startsWith('/purchase-orders') && !pathname.startsWith('/purchase-orders/new')

  return (
    <Offcanvas responsive="lg" show={show} onHide={onHide} className="app-sidebar" aria-label="Menu chính">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title as="span">Menu</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body className="p-0">
        <Nav className="flex-column w-100 py-2" as="nav">
          {can(PERMISSIONS.VIEW) && (
            <NavLink to="/purchase-orders" end={false} className={() => `nav-link sidebar-link ${listActive ? 'active' : ''}`} onClick={onHide}>
              <i className="bi bi-card-list me-2" aria-hidden="true" />
              Đơn mua hàng
            </NavLink>
          )}
          {can(PERMISSIONS.CREATE) && (
            <NavLink to="/purchase-orders/new" className={({ isActive }) => `nav-link sidebar-link ${isActive ? 'active' : ''}`} onClick={onHide}>
              <i className="bi bi-plus-circle me-2" aria-hidden="true" />
              Tạo đơn mua hàng
            </NavLink>
          )}
        </Nav>
      </Offcanvas.Body>
    </Offcanvas>
  )
}
