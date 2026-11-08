import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { authApi } from '../src/api/authApi'
import { AuthProvider } from '../src/auth/AuthContext'
import { ToastProvider } from '../src/components/common/ToastProvider'
import { routes } from '../src/routes'
import { setToken } from '../src/utils/tokenStorage'

export const USERS = {
  manager: { id: 1, username: 'manager', staffId: 1, fullName: 'Demo Manager', role: { name: 'Manager' }, permissions: ['APPROVE_PURCHASE_ORDER', 'CANCEL_PURCHASE_ORDER', 'CREATE_PURCHASE_ORDER', 'VIEW_PURCHASE_ORDER'], requirePasswordChange: false },
  warehouse: { id: 2, username: 'warehouse', staffId: 2, fullName: 'Demo Warehouse Staff', role: { name: 'Warehouse Staff' }, permissions: ['CREATE_PURCHASE_ORDER', 'VIEW_PURCHASE_ORDER'], requirePasswordChange: false },
  cashier: { id: 3, username: 'cashier', staffId: 3, fullName: 'Demo Cashier', role: { name: 'Cashier' }, permissions: [], requirePasswordChange: false },
}

export const makePo = (overrides = {}) => ({
  id: 7,
  poCode: 'PO-000007',
  status: 'PENDING',
  note: 'Ghi chú đơn',
  supplier: { id: 1, name: 'Công ty Snapshot', taxId: '0100000001', phoneNumber: '0281000001', address: '12 Nguyễn Huệ' },
  totalAmount: 1110000,
  createdBy: { staffId: 2, fullName: 'Demo Warehouse Staff' },
  approvedBy: null,
  canceledBy: null,
  createdAt: '2026-11-08T03:00:00.000Z',
  approvedAt: null,
  canceledAt: null,
  cancelReason: null,
  items: [
    { id: 1, variantId: 10, productId: 5, productCode: 'RICE', productName: 'Gạo ST25', unitName: 'bag', conversionFactor: 1, quantity: 10, costPrice: 95000, total: 950000, receivedQuantity: 0, note: null },
    { id: 2, variantId: 11, productId: 6, productCode: 'NOODLE', productName: 'Mì Hảo Hảo', unitName: 'pack', conversionFactor: 1, quantity: 50, costPrice: 3200, total: 160000, receivedQuantity: 0, note: 'gấp' },
  ],
  timeline: [{ event: 'CREATED', at: '2026-11-08T03:00:00.000Z', by: { staffId: 2, fullName: 'Demo Warehouse Staff' } }],
  availableActions: ['APPROVE', 'CANCEL'],
  ...overrides,
})

export const makeListItem = (n, overrides = {}) => ({
  id: n, poCode: `PO-${String(n).padStart(6, '0')}`, createdAt: '2026-11-08T03:00:00.000Z', supplierId: 1, supplierName: `Nhà cung cấp ${n}`,
  createdBy: 2, createdByName: 'Demo Warehouse Staff', totalAmount: 100000 * n, status: 'PENDING', itemCount: 2, ...overrides,
})

export const listResult = (items, pagination) => ({
  data: { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1, ...pagination } },
  status: 200,
})

/** Renders the real routes with a memory router. API modules are mocked per test with vi.spyOn. */
export function renderApp(path, { user = USERS.manager, authed = true } = {}) {
  if (authed) {
    setToken('test-token')
    vi.spyOn(authApi, 'me').mockResolvedValue(user)
  }
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>,
  )
  return { router, ...utils }
}
