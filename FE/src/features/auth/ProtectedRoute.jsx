import { Navigate, useLocation } from 'react-router-dom'
import ErrorState from '../../shared/components/ErrorState'
import LoadingState from '../../shared/components/LoadingState'
import ForbiddenPage from '../../shared/pages/ForbiddenPage'
import { hasPermission } from './utils/permissions'
import { useAuth } from './useAuth'

/**
 * Requires an authenticated session. Optional `anyOf`: permission keys, at least one must be granted, otherwise the
 * Forbidden page is rendered in place (the session is kept: 403 is not a logout).
 */
export default function ProtectedRoute({ anyOf, children }) {
  const { status, user, retryRestore, explicitLogout } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState fullPage text="Đang khôi phục phiên đăng nhập..." />
  if (status === 'error') {
    return (
      <div className="container py-5">
        <ErrorState message="Không kết nối được máy chủ để khôi phục phiên đăng nhập." onRetry={retryRestore} />
      </div>
    )
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace state={explicitLogout ? undefined : { from: location }} />
  if (anyOf && !anyOf.some((key) => hasPermission(user, key))) return <ForbiddenPage />
  return children
}
