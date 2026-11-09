import { useState } from 'react'
import { Alert } from 'react-bootstrap'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import AppNavbar from './AppNavbar'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dismissedPwd, setDismissedPwd] = useState(false)
  const { user } = useAuth()
  return (
    <div className="app-shell">
      <AppNavbar onMenu={() => setMenuOpen(true)} />
      <div className="d-lg-flex app-body">
        <Sidebar show={menuOpen} onHide={() => setMenuOpen(false)} />
        <main className="flex-grow-1 p-3 p-md-4 app-main" id="main">
          {user?.requirePasswordChange && !dismissedPwd && (
            <Alert variant="info" dismissible onClose={() => setDismissedPwd(true)}>
              Tài khoản được yêu cầu đổi mật khẩu, nhưng phiên bản hiện tại của hệ thống chưa hỗ trợ chức năng đổi mật khẩu.
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
