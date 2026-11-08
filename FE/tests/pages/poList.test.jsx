import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/axiosClient'
import { purchaseOrderApi } from '../../src/api/purchaseOrderApi'
import { listResult, makeListItem, renderApp, USERS } from '../helpers'

const rows = (n) => Array.from({ length: n }, (_, i) => makeListItem(i + 1))
const lastParams = (spy) => spy.mock.calls.at(-1)[0]

describe('UC23 - Purchase Order list (FE-UC23)', () => {
  it('renders the required columns and rows from the API (no hardcoded data)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(
      listResult([makeListItem(12, { status: 'APPROVED', totalAmount: 1110000, supplierName: 'Công ty ABC' }), makeListItem(3, { status: 'CANCELED' })], { total: 2 }),
    )
    renderApp('/purchase-orders')
    expect(await screen.findByText('PO-000012')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Danh sách đơn mua hàng' })
    for (const col of ['Mã đơn', 'Ngày tạo', 'Nhà cung cấp', 'Người tạo', 'Tổng tiền', 'Trạng thái', 'Số dòng', 'Thao tác']) expect(within(table).getByText(col)).toBeInTheDocument()
    expect(within(table).getByText('Công ty ABC')).toBeInTheDocument()
    expect(within(table).getByText('Đã duyệt')).toBeInTheDocument()
    expect(within(table).getByText('Đã hủy')).toBeInTheDocument()
    expect(within(table).getByText(/1\.110\.000/)).toBeInTheDocument()
    expect(within(table).getAllByText(/10:00.*08\/11\/2026|08\/11\/2026.*10:00/).length).toBe(2) // 03:00Z shown in Vietnam time (UTC+7)
    expect(screen.getByTestId('result-count')).toHaveTextContent('Tìm thấy 2 đơn')
    expect(lastParams(list)).toEqual({ sortBy: 'createdAt', sortDir: 'desc', page: 1, pageSize: 20 })
  })

  it('shows the create button only with CREATE permission (Manager yes, both roles can view)', async () => {
    vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(1)))
    renderApp('/purchase-orders', { user: USERS.warehouse })
    expect(await screen.findByText('PO-000001')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Tạo đơn mua hàng/ }).length).toBeGreaterThan(0)
  })

  it('empty state without filters and with filters (23.0.E1)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult([], { total: 0, totalPages: 0 }))
    const { unmount } = renderApp('/purchase-orders')
    expect(await screen.findByText('Chưa có đơn mua hàng nào')).toBeInTheDocument()
    unmount()
    renderApp('/purchase-orders?status=APPROVED')
    expect(await screen.findByText('Không tìm thấy đơn mua hàng phù hợp')).toBeInTheDocument()
    expect(lastParams(list).status).toBe('APPROVED')
  })

  it('shows an error state with Retry (23.0.E2) and recovers', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockRejectedValueOnce(new ApiError({ status: 500, code: 'DB_ERROR' })).mockResolvedValue(listResult(rows(2)))
    renderApp('/purchase-orders')
    expect(await screen.findByTestId('error-state')).toHaveTextContent('lỗi cơ sở dữ liệu')
    await userEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
    expect(await screen.findByText('PO-000001')).toBeInTheDocument()
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('reads filter / sort / page from the URL (23.1, 23.3)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(3), { page: 2, totalPages: 5, total: 90 }))
    renderApp('/purchase-orders?status=PENDING&from=2026-01-01&to=2026-12-31&q=abc&sortBy=totalAmount&sortDir=asc&page=2&pageSize=50')
    await screen.findByText('PO-000001')
    expect(lastParams(list)).toEqual({ status: 'PENDING', from: '2026-01-01', to: '2026-12-31', q: 'abc', sortBy: 'totalAmount', sortDir: 'asc', page: 2, pageSize: 50 })
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('PENDING')
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText(/Tìm theo mã đơn/)).toHaveValue('abc')
    expect(screen.getByLabelText('Số dòng / trang')).toHaveValue('50')
  })

  it('status filter updates the URL and the API call, and resets to page 1', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(2), { page: 3, totalPages: 5, total: 100 }))
    const { router } = renderApp('/purchase-orders?page=3')
    await screen.findByText('PO-000001')
    expect(lastParams(list).page).toBe(3)
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'APPROVED')
    await waitFor(() => expect(router.state.location.search).toBe('?status=APPROVED'))
    await waitFor(() => expect(lastParams(list)).toMatchObject({ status: 'APPROVED', page: 1 }))
  })

  it('search is debounced into the URL (23.2) - typing does not fire one request per keystroke', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(1)))
    const { router } = renderApp('/purchase-orders')
    await screen.findByText('PO-000001')
    const before = list.mock.calls.length
    await userEvent.type(screen.getByLabelText(/Tìm theo mã đơn/), 'PO-12')
    expect(list.mock.calls.length).toBe(before) // nothing yet
    await waitFor(() => expect(router.state.location.search).toBe('?q=PO-12'), { timeout: 2000 })
    await waitFor(() => expect(lastParams(list)).toMatchObject({ q: 'PO-12', page: 1 }))
    expect(list.mock.calls.length).toBe(before + 1)
  })

  it('date range: valid range is applied, invalid range shows an error and calls no API (23.1)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(1)))
    const { router } = renderApp('/purchase-orders')
    await screen.findByText('PO-000001')
    await userEvent.type(screen.getByLabelText('Từ ngày'), '2026-03-01')
    await waitFor(() => expect(router.state.location.search).toBe('?from=2026-03-01'))
    const calls = list.mock.calls.length
    await userEvent.type(screen.getByLabelText('Đến ngày'), '2026-02-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày bắt đầu không được sau ngày kết thúc.')
    expect(list.mock.calls.length).toBe(calls)
    expect(router.state.location.search).toBe('?from=2026-03-01')
    await userEvent.clear(screen.getByLabelText('Đến ngày'))
    await userEvent.type(screen.getByLabelText('Đến ngày'), '2026-04-01')
    await waitFor(() => expect(router.state.location.search).toBe('?from=2026-03-01&to=2026-04-01'))
  })

  it('sort by clicking a header toggles direction and resets the page (23.3)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(2), { page: 2, totalPages: 3 }))
    const { router } = renderApp('/purchase-orders?page=2')
    await screen.findByText('PO-000001')
    await userEvent.click(screen.getByRole('columnheader', { name: /Tổng tiền/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?sortBy=totalAmount'))
    expect(lastParams(list)).toMatchObject({ sortBy: 'totalAmount', sortDir: 'desc', page: 1 })
    await userEvent.click(screen.getByRole('columnheader', { name: /Tổng tiền/ }))
    await waitFor(() => expect(lastParams(list)).toMatchObject({ sortBy: 'totalAmount', sortDir: 'asc' }))
    expect(screen.getByRole('columnheader', { name: /Tổng tiền/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('server-side pagination: next / page number / page size', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(2), { page: 1, totalPages: 4, total: 80 }))
    const { router } = renderApp('/purchase-orders')
    await screen.findByText('PO-000001')
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(lastParams(list).page).toBe(2)
    await userEvent.click(screen.getByRole('button', { name: 'Trang 4' }))
    await waitFor(() => expect(lastParams(list).page).toBe(4))
    await userEvent.selectOptions(screen.getByLabelText('Số dòng / trang'), '50')
    await waitFor(() => expect(lastParams(list)).toMatchObject({ pageSize: 50, page: 1 }))
  })

  it('"Xóa bộ lọc" clears filters but keeps sort', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult(rows(1)))
    const { router } = renderApp('/purchase-orders?status=PENDING&q=x&sortBy=supplierName')
    await screen.findByText('PO-000001')
    await userEvent.click(screen.getByRole('button', { name: /Xóa bộ lọc/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?sortBy=supplierName'))
    expect(lastParams(list).status).toBeUndefined()
  })

  it('an old response never overwrites a newer one (race)', async () => {
    let resolveOld
    const list = vi.spyOn(purchaseOrderApi, 'list')
    list.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    list.mockResolvedValue(listResult([makeListItem(99, { supplierName: 'MỚI' })]))
    const { router } = renderApp('/purchase-orders')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'PENDING')
    expect(await screen.findByText('MỚI')).toBeInTheDocument()
    resolveOld(listResult([makeListItem(1, { supplierName: 'CŨ' })]))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText('CŨ')).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=PENDING')
  })
})
