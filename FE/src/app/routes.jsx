import { Navigate } from 'react-router-dom'
import { LoginPage, ProtectedRoute } from '../features/auth'
import AppLayout from '../shared/layouts/AppLayout'
import { CreatePurchaseOrderPage, PurchaseOrderDetailPage, PurchaseOrderListPage } from '../features/purchase-order'
import NotFoundPage from '../shared/pages/NotFoundPage'
import { PERMISSIONS } from '../features/auth/utils/permissions'

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
