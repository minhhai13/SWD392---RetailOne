import { Navigate } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import CreatePurchaseOrderPage from './pages/CreatePurchaseOrderPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PurchaseOrderDetailPage from './pages/PurchaseOrderDetailPage'
import PurchaseOrderListPage from './pages/PurchaseOrderListPage'
import { PERMISSIONS } from './utils/permissions'

// Data-router config (also used by tests with createMemoryRouter). Every business route is permission-guarded.
export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/purchase-orders" replace /> },
      { path: 'purchase-orders', element: <ProtectedRoute anyOf={[PERMISSIONS.VIEW]}><PurchaseOrderListPage /></ProtectedRoute> },
      { path: 'purchase-orders/new', element: <ProtectedRoute anyOf={[PERMISSIONS.CREATE]}><CreatePurchaseOrderPage /></ProtectedRoute> },
      { path: 'purchase-orders/:id', element: <ProtectedRoute anyOf={[PERMISSIONS.VIEW]}><PurchaseOrderDetailPage /></ProtectedRoute> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
