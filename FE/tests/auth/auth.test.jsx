import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '../../src/api/authApi'
import { apiClient, ApiError, toApiError } from '../../src/api/axiosClient'
import { purchaseOrderApi } from '../../src/api/purchaseOrderApi'
import { getToken, setToken } from '../../src/utils/tokenStorage'
import { listResult, makeListItem, renderApp, USERS } from '../helpers'

const emptyList = () => vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult([makeListItem(1)]))

describe('Login page (FE-AUTH-01)', () => {
  it('requires username and password and does not call the API', async () => {
    const login = vi.spyOn(authApi, 'login')
    renderApp('/login', { authed: false })
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Vui lòng nhập tên đăng nhập.')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('logs in with Enter, stores only the token (sessionStorage) and opens the list', async () => {
    emptyList()
    const login = vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'jwt-123', user: USERS.manager })
    const { router } = renderApp('/login', { authed: false })
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'manager')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'secret-pass{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(login).toHaveBeenCalledWith('manager', 'secret-pass')
    expect(getToken()).toBe('jwt-123')
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain('secret-pass') // the password is never stored
    expect(await screen.findByText('Demo Manager')).toBeInTheDocument()
  })

  it('shows a clear error for wrong credentials and keeps the user on the page', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }))
    const { router } = renderApp('/login', { authed: false })
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'manager')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'wrong{Enter}')
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Sai tên đăng nhập hoặc mật khẩu.')
    expect(router.state.location.pathname).toBe('/login')
    expect(getToken()).toBeNull()
  })

  it('shows a locked-account / network error without leaking details', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(new ApiError({ status: 403, code: 'ACCOUNT_LOCKED' })).mockRejectedValueOnce(new ApiError({ isNetwork: true }))
    renderApp('/login', { authed: false })
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'u')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'p{Enter}')
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Tài khoản đã bị khóa')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('Không kết nối được máy chủ'))
  })

  it('toggles password visibility', async () => {
    renderApp('/login', { authed: false })
    const input = await screen.findByLabelText('Mật khẩu')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('blocks double submit while the request is running', async () => {
    let resolve
    const login = vi.spyOn(authApi, 'login').mockImplementation(() => new Promise((r) => (resolve = r)))
    emptyList()
    renderApp('/login', { authed: false })
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'manager')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'pw')
    const button = screen.getByRole('button', { name: 'Đăng nhập' })
    await userEvent.click(button)
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(login).toHaveBeenCalledTimes(1)
    resolve({ token: 't', user: USERS.manager })
  })
})

describe('Session, protected routes, logout (FE-AUTH-02)', () => {
  it('redirects anonymous users to /login and returns to the requested page after login', async () => {
    emptyList()
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'jwt', user: USERS.manager })
    const { router } = renderApp('/purchase-orders?status=PENDING', { authed: false })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'manager')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'pw{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(router.state.location.search).toBe('?status=PENDING')
  })

  it('restores the session on reload with GET /auth/me (spinner first, no flicker to /login)', async () => {
    emptyList()
    const { router } = renderApp('/purchase-orders', { user: USERS.warehouse })
    expect(screen.getByText('Đang khôi phục phiên đăng nhập...')).toBeInTheDocument()
    expect(await screen.findByText('Demo Warehouse Staff')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/purchase-orders')
    expect(authApi.me).toHaveBeenCalledTimes(1)
  })

  it('clears an invalid token and goes to login when /auth/me answers 401', async () => {
    setToken('stale')
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError({ status: 401, code: 'TOKEN_EXPIRED' }))
    const { router } = renderApp('/purchase-orders', { authed: false })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(getToken()).toBeNull()
  })

  it('offers a retry (and keeps the token) when the backend is unreachable during restore', async () => {
    setToken('keep-me')
    const me = vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError({ isNetwork: true })).mockResolvedValue(USERS.manager)
    emptyList()
    renderApp('/purchase-orders', { authed: false })
    expect(await screen.findByText(/Không kết nối được máy chủ để khôi phục/)).toBeInTheDocument()
    expect(getToken()).toBe('keep-me')
    await userEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
    expect(await screen.findByText('Demo Manager')).toBeInTheDocument()
    expect(me).toHaveBeenCalledTimes(2)
  })

  it('logout calls the API, clears the token and returns to login', async () => {
    emptyList()
    const logout = vi.spyOn(authApi, 'logout').mockResolvedValue({})
    const { router } = renderApp('/purchase-orders')
    await userEvent.click(await screen.findByRole('button', { name: /Đăng xuất/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(logout).toHaveBeenCalled()
    expect(getToken()).toBeNull()
  })

  it('after a deliberate logout the next login goes to the default page, not the page visited before', async () => {
    emptyList()
    vi.spyOn(authApi, 'logout').mockResolvedValue({})
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'jwt', user: USERS.warehouse })
    const { router } = renderApp('/purchase-orders?status=APPROVED')
    await userEvent.click(await screen.findByRole('button', { name: /Đăng xuất/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.state).toBeNull()
    await userEvent.type(await screen.findByLabelText('Tên đăng nhập'), 'warehouse')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'pw{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(router.state.location.search).toBe('')
  })

  it('an authenticated user visiting /login is sent to the list', async () => {
    emptyList()
    const { router } = renderApp('/login')
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
  })
})

describe('Role based UI (FE-RBAC-01)', () => {
  it('Manager and Warehouse Staff see the procurement menu; header shows name and role', async () => {
    emptyList()
    renderApp('/purchase-orders', { user: USERS.manager })
    expect((await screen.findAllByRole('link', { name: /Đơn mua hàng/ })).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /Tạo đơn mua hàng/ }).length).toBeGreaterThanOrEqual(1) // sidebar + page header
    expect(screen.getByTestId('user-info')).toHaveTextContent('Demo Manager')
    expect(screen.getByTestId('user-info')).toHaveTextContent('Manager')
  })

  it('Cashier gets the Forbidden page, no menu links and keeps the session (403 is not a logout)', async () => {
    const list = emptyList()
    const { router } = renderApp('/purchase-orders', { user: USERS.cashier })
    expect(await screen.findByText('Bạn không đủ quyền truy cập chức năng này')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Đơn mua hàng/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tạo đơn mua hàng/ })).not.toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/purchase-orders')
    expect(getToken()).toBe('test-token')
  })

  it('Cashier cannot open the create or detail routes either', async () => {
    renderApp('/purchase-orders/new', { user: USERS.cashier })
    expect(await screen.findByText('Bạn không đủ quyền truy cập chức năng này')).toBeInTheDocument()
  })

  it('shows the unknown-route page inside the app shell', async () => {
    emptyList()
    renderApp('/nope/nothing')
    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument()
  })
})

describe('Axios client (FE-AUTH-03)', () => {
  const failWith = (status, data) => {
    apiClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error('fail'), { config, response: { status, data, config } }))
  }
  const original = apiClient.defaults.adapter

  it('sends the Bearer token on every request', async () => {
    setToken('tok-1')
    let seen
    apiClient.defaults.adapter = async (config) => {
      seen = config.headers.Authorization
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }
    }
    await apiClient.get('/health')
    apiClient.defaults.adapter = original
    expect(seen).toBe('Bearer tok-1')
  })

  it('401 on a normal call clears the session (handler), 401 on login does not', async () => {
    emptyList()
    const { router } = renderApp('/purchase-orders')
    await screen.findByText('Demo Manager')
    purchaseOrderApi.list.mockRestore()
    failWith(401, { success: false, code: 'TOKEN_EXPIRED', message: 'Token has expired.' })
    vi.spyOn(authApi, 'logout').mockResolvedValue({})
    // a real axios call through the client triggers the interceptor
    await apiClient.get('/inventory/purchase-orders').catch(() => {})
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(getToken()).toBeNull()
    expect(await screen.findByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument()
    apiClient.defaults.adapter = original
  })

  it('403 does NOT clear the session', async () => {
    emptyList()
    renderApp('/purchase-orders')
    await screen.findByText('Demo Manager')
    failWith(403, { success: false, code: 'FORBIDDEN' })
    await apiClient.get('/inventory/purchase-orders').catch((e) => expect(e.status).toBe(403))
    apiClient.defaults.adapter = original
    expect(getToken()).toBe('test-token')
  })

  it('normalizes errors: backend envelope, network, timeout, cancel', () => {
    const fromBackend = toApiError({ response: { status: 409, data: { code: 'PO_INVALID_STATUS', message: 'm', details: { currentStatus: 'APPROVED' } } } })
    expect(fromBackend).toMatchObject({ status: 409, code: 'PO_INVALID_STATUS', details: { currentStatus: 'APPROVED' } })
    expect(toApiError({ request: {} }).isNetwork).toBe(true)
    expect(toApiError({ code: 'ECONNABORTED' }).isTimeout).toBe(true)
    expect(toApiError({ code: 'ERR_CANCELED' }).canceled).toBe(true)
  })
})
