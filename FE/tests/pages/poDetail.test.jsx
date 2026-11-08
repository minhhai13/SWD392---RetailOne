import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/axiosClient'
import { purchaseOrderApi } from '../../src/api/purchaseOrderApi'
import { getToken } from '../../src/utils/tokenStorage'
import { listResult, makeListItem, makePo, renderApp, USERS } from '../helpers'

const detail = (po) => ({ data: po, status: 200 })
const getSpy = (...pos) => {
  const spy = vi.spyOn(purchaseOrderApi, 'get')
  pos.forEach((po, i) => (i === pos.length - 1 ? spy.mockResolvedValue(detail(po)) : spy.mockResolvedValueOnce(detail(po))))
  return spy
}
const canceledPo = makePo({
  status: 'CANCELED', availableActions: [], approvedBy: { staffId: 1, fullName: 'Demo Manager' }, approvedAt: '2026-11-08T04:00:00.000Z', canceledBy: { staffId: 1, fullName: 'Demo Manager' },
  canceledAt: '2026-11-08T05:00:00.000Z', cancelReason: 'Nhà cung cấp không giao được hàng',
  timeline: [
    { event: 'CREATED', at: '2026-11-08T03:00:00.000Z', by: { staffId: 2, fullName: 'Demo Warehouse Staff' } },
    { event: 'APPROVED', at: '2026-11-08T04:00:00.000Z', by: { staffId: 1, fullName: 'Demo Manager' } },
    { event: 'CANCELED', at: '2026-11-08T05:00:00.000Z', by: { staffId: 1, fullName: 'Demo Manager' }, reason: 'Nhà cung cấp không giao được hàng' },
  ],
})
const approvedPo = makePo({ status: 'APPROVED', availableActions: ['CANCEL'], approvedBy: { staffId: 1, fullName: 'Demo Manager' }, approvedAt: '2026-11-08T04:00:00.000Z' })

describe('UC24 - Purchase Order details (FE-UC24)', () => {
  it('shows header, supplier SNAPSHOT, items with snapshot prices, totals, note and timeline', async () => {
    const get = getSpy(makePo())
    renderApp('/purchase-orders/7')
    expect(await screen.findByRole('heading', { level: 1, name: /PO-000007/ })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('7', expect.anything())
    expect(screen.getByText('Công ty Snapshot')).toBeInTheDocument()
    expect(screen.getByText('0100000001')).toBeInTheDocument()
    expect(screen.getByText('0281000001')).toBeInTheDocument()
    expect(screen.getByText('12 Nguyễn Huệ')).toBeInTheDocument()
    expect(screen.getByText(/không thay đổi khi nhà cung cấp cập nhật/)).toBeInTheDocument()
    const items = screen.getByRole('table', { name: 'Các dòng hàng của đơn' })
    expect(within(items).getByText('Gạo ST25')).toBeInTheDocument()
    expect(within(items).getByText('Mì Hảo Hảo')).toBeInTheDocument()
    expect(within(items).getByText(/95\.000/)).toBeInTheDocument()
    expect(screen.getByTestId('po-total')).toHaveTextContent(/1\.110\.000/)
    expect(screen.getByText('Ghi chú đơn')).toBeInTheDocument()
    expect(screen.getAllByText('Demo Warehouse Staff').length).toBeGreaterThan(0)
    expect(screen.getByText('Tạo đơn')).toBeInTheDocument() // timeline CREATED
    expect(screen.getByText(/không phải nhật ký thay đổi đầy đủ/)).toBeInTheDocument()
  })

  it('timeline shows CREATED, APPROVED, CANCELED with the people and the reason; cancel info banner', async () => {
    getSpy(canceledPo)
    renderApp('/purchase-orders/7')
    const timeline = await screen.findByRole('list', { name: 'Dòng thời gian của đơn' })
    const events = within(timeline).getAllByRole('listitem').map((li) => li.getAttribute('data-event'))
    expect(events).toEqual(['CREATED', 'APPROVED', 'CANCELED'])
    expect(within(timeline).getByText('Lý do: Nhà cung cấp không giao được hàng')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-info')).toHaveTextContent('Đơn đã bị hủy')
    expect(screen.getByTestId('cancel-info')).toHaveTextContent('Nhà cung cấp không giao được hàng')
  })

  it('actions follow availableActions AND permission', async () => {
    getSpy(makePo())
    const { unmount } = renderApp('/purchase-orders/7', { user: USERS.manager })
    expect(await screen.findByRole('button', { name: /Duyệt đơn/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hủy đơn/ })).toBeInTheDocument()
    unmount()

    getSpy(makePo())
    const wh = renderApp('/purchase-orders/7', { user: USERS.warehouse })
    await screen.findByRole('heading', { level: 1, name: /PO-000007/ })
    expect(screen.queryByRole('button', { name: /Duyệt đơn/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hủy đơn/ })).not.toBeInTheDocument()
    wh.unmount()

    getSpy(approvedPo)
    renderApp('/purchase-orders/7', { user: USERS.manager })
    await screen.findByRole('heading', { level: 1, name: /PO-000007/ })
    expect(screen.queryByRole('button', { name: /Duyệt đơn/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hủy đơn/ })).toBeInTheDocument()
  })

  it('CANCELED / RECEIVED orders have no action buttons', async () => {
    getSpy(canceledPo)
    const { unmount } = renderApp('/purchase-orders/7')
    await screen.findByTestId('cancel-info')
    expect(screen.queryByRole('button', { name: /Duyệt đơn|Hủy đơn/ })).not.toBeInTheDocument()
    unmount()
    getSpy(makePo({ status: 'RECEIVED', availableActions: [] }))
    renderApp('/purchase-orders/7')
    expect((await screen.findAllByText('Đã nhận hàng')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Duyệt đơn|Hủy đơn/ })).not.toBeInTheDocument()
  })

  it('404 -> not-found page with a link back to the list (24.0.E1)', async () => {
    vi.spyOn(purchaseOrderApi, 'get').mockRejectedValue(new ApiError({ status: 404, code: 'PO_NOT_FOUND' }))
    renderApp('/purchase-orders/99999')
    expect(await screen.findByText('Không tìm thấy đơn mua hàng')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Về danh sách đơn mua hàng/ })).toHaveAttribute('href', '/purchase-orders')
  })

  it('other errors -> error state with Retry', async () => {
    const get = vi.spyOn(purchaseOrderApi, 'get').mockRejectedValueOnce(new ApiError({ isNetwork: true })).mockResolvedValue(detail(makePo()))
    renderApp('/purchase-orders/7')
    expect(await screen.findByTestId('error-state')).toHaveTextContent('Không kết nối được máy chủ')
    await userEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
    expect(await screen.findByRole('heading', { level: 1, name: /PO-000007/ })).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('list -> detail -> back keeps the filters and the page (24.1)', async () => {
    const list = vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue(listResult([makeListItem(7)], { page: 2, totalPages: 3, total: 50 }))
    getSpy(makePo())
    const { router } = renderApp('/purchase-orders?status=PENDING&page=2&sortBy=totalAmount&sortDir=asc')
    await userEvent.click(await screen.findByRole('link', { name: /Xem chi tiết PO-000007/ }))
    expect(await screen.findByRole('heading', { level: 1, name: /PO-000007/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/purchase-orders/7')
    await userEvent.click(screen.getByRole('link', { name: /Quay lại danh sách/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(router.state.location.search).toBe('?status=PENDING&page=2&sortBy=totalAmount&sortDir=asc')
    await waitFor(() => expect(list.mock.calls.at(-1)[0]).toMatchObject({ status: 'PENDING', page: 2, sortBy: 'totalAmount', sortDir: 'asc' }))
  })
})

describe('UC25 - Approve (FE-UC25)', () => {
  const openApprove = async (user = USERS.manager) => {
    const r = renderApp('/purchase-orders/7', { user })
    await userEvent.click(await screen.findByRole('button', { name: /Duyệt đơn/ }))
    return { ...r, dialog: await screen.findByRole('dialog') }
  }

  it('modal shows PO code, supplier and total; Cancel closes it without calling the API (25.1)', async () => {
    getSpy(makePo())
    const approve = vi.spyOn(purchaseOrderApi, 'approve')
    const { dialog } = await openApprove()
    expect(within(dialog).getByText('PO-000007')).toBeInTheDocument()
    expect(within(dialog).getByText('Công ty Snapshot')).toBeInTheDocument()
    expect(within(dialog).getByText(/1\.110\.000/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(approve).not.toHaveBeenCalled()
  })

  it('confirm approves once (double click blocked), sends no body, reloads the PO and shows APPROVED', async () => {
    const get = getSpy(makePo(), approvedPo)
    let resolve
    const approve = vi.spyOn(purchaseOrderApi, 'approve').mockImplementation(() => new Promise((r) => (resolve = r)))
    const { dialog } = await openApprove()
    const confirm = within(dialog).getByRole('button', { name: /Xác nhận duyệt/ })
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    await userEvent.dblClick(confirm)
    expect(approve).toHaveBeenCalledTimes(1)
    expect(approve).toHaveBeenCalledWith(7)
    resolve({ data: approvedPo, status: 200 })
    expect(await screen.findByText('Đã duyệt đơn PO-000007.')).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2)) // always re-read after the action
    await waitFor(() => expect(screen.queryByRole('button', { name: /Duyệt đơn/ })).not.toBeInTheDocument())
    expect(screen.getAllByText('Đã duyệt').length).toBeGreaterThan(0)
  })

  it('409 PO_INVALID_STATUS: error message, modal closes, PO reloaded (25.0.E1)', async () => {
    const get = getSpy(makePo(), approvedPo)
    vi.spyOn(purchaseOrderApi, 'approve').mockRejectedValue(new ApiError({ status: 409, code: 'PO_INVALID_STATUS', details: { currentStatus: 'APPROVED' } }))
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByText(/Trạng thái đơn không còn hợp lệ/)).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('403: shows "no permission" and keeps the session (no logout)', async () => {
    getSpy(makePo())
    vi.spyOn(purchaseOrderApi, 'approve').mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN' }))
    const { router, dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByText('Bạn không đủ quyền thực hiện thao tác này.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/purchase-orders/7')
    expect(getToken()).toBe('test-token')
  })

  it('422 inactive supplier: message shown, PO unchanged (25.0.E2)', async () => {
    const get = getSpy(makePo())
    vi.spyOn(purchaseOrderApi, 'approve').mockRejectedValue(new ApiError({ status: 422, code: 'SUPPLIER_INACTIVE' }))
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByText('Nhà cung cấp đã ngừng hoạt động.')).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Duyệt đơn/ })).toBeInTheDocument()
  })

  it('COMMIT_OUTCOME_UNKNOWN / network: warns, does NOT retry, reloads to show the real state (25.0.E3)', async () => {
    const get = getSpy(makePo())
    const approve = vi.spyOn(purchaseOrderApi, 'approve').mockRejectedValue(new ApiError({ status: 500, code: 'COMMIT_OUTCOME_UNKNOWN' }))
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByText(/Chưa xác định được thao tác đã được lưu hay chưa/)).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(approve).toHaveBeenCalledTimes(1)
  })

  it('DB error stays inline in the modal so the user can retry', async () => {
    getSpy(makePo())
    const approve = vi.spyOn(purchaseOrderApi, 'approve').mockRejectedValueOnce(new ApiError({ status: 500, code: 'DB_ERROR' })).mockResolvedValue({ data: approvedPo, status: 200 })
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('lỗi cơ sở dữ liệu')
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2))
  })

  it('meta.detailLoaded=false after approve: still success, tells the user, reloads', async () => {
    const get = getSpy(makePo(), approvedPo)
    vi.spyOn(purchaseOrderApi, 'approve').mockResolvedValue({ data: { id: 7, status: 'APPROVED' }, meta: { detailLoaded: false }, status: 200 })
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByText('Đã duyệt đơn PO-000007.')).toBeInTheDocument()
    expect(await screen.findByText(/chưa tải được chi tiết mới/)).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('if the reload after a saved action fails, the page says the action WAS saved and offers Retry', async () => {
    const get = vi.spyOn(purchaseOrderApi, 'get').mockResolvedValueOnce(detail(makePo())).mockRejectedValueOnce(new ApiError({ isNetwork: true })).mockResolvedValue(detail(approvedPo))
    vi.spyOn(purchaseOrderApi, 'approve').mockResolvedValue({ data: approvedPo, status: 200 })
    const { dialog } = await openApprove()
    await userEvent.click(within(dialog).getByRole('button', { name: /Xác nhận duyệt/ }))
    expect(await screen.findByTestId('error-state')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3))
  })
})

describe('UC26 - Cancel (FE-UC26)', () => {
  const openCancel = async () => {
    const r = renderApp('/purchase-orders/7', { user: USERS.manager })
    await userEvent.click(await screen.findByRole('button', { name: /Hủy đơn/ }))
    return { ...r, dialog: await screen.findByRole('dialog') }
  }
  const confirmButton = (dialog) => within(dialog).getByRole('button', { name: /Xác nhận hủy đơn/ })

  it('the reason is required: empty and whitespace-only are rejected at the field, no API call (26.0.E2)', async () => {
    getSpy(makePo())
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel')
    const { dialog } = await openCancel()
    await userEvent.click(confirmButton(dialog))
    expect(await within(dialog).findByText('Vui lòng nhập lý do hủy đơn.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), '    ')
    await userEvent.click(confirmButton(dialog))
    expect(within(dialog).getByText('Vui lòng nhập lý do hủy đơn.')).toBeInTheDocument()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('counts characters and blocks more than 500', async () => {
    getSpy(makePo())
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel')
    const { dialog } = await openCancel()
    const box = within(dialog).getByLabelText(/Lý do hủy/)
    await userEvent.click(box)
    await userEvent.paste('a'.repeat(501))
    expect(within(dialog).getByTestId('reason-count')).toHaveTextContent('501/500')
    await userEvent.click(confirmButton(dialog))
    expect(await within(dialog).findByText('Lý do tối đa 500 ký tự.')).toBeInTheDocument()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels a PENDING order with the TRIMMED reason, reloads and shows CANCELED with the reason', async () => {
    const get = getSpy(makePo(), canceledPo)
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel').mockResolvedValue({ data: canceledPo, status: 200 })
    const { dialog } = await openCancel()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), '  Nhà cung cấp không giao được hàng  ')
    await userEvent.click(confirmButton(dialog))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(7, 'Nhà cung cấp không giao được hàng'))
    expect(await screen.findByText('Đã hủy đơn PO-000007.')).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('cancel-info')).toHaveTextContent('Nhà cung cấp không giao được hàng')
    expect(screen.queryByRole('button', { name: /Hủy đơn/ })).not.toBeInTheDocument()
  })

  it('can cancel an APPROVED order (and warns to tell the supplier)', async () => {
    getSpy(approvedPo, canceledPo)
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel').mockResolvedValue({ data: canceledPo, status: 200 })
    const { dialog } = await openCancel()
    expect(within(dialog).getByText(/thông báo hủy đơn cho họ bên ngoài hệ thống/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), 'Không nhận được hàng')
    await userEvent.click(confirmButton(dialog))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(7, 'Không nhận được hàng'))
  })

  it('closing the modal (26.1) sends nothing', async () => {
    getSpy(makePo())
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel')
    const { dialog } = await openCancel()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cancel).not.toHaveBeenCalled()
  })

  it('prevents a double submit', async () => {
    getSpy(makePo(), canceledPo)
    let resolve
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel').mockImplementation(() => new Promise((r) => (resolve = r)))
    const { dialog } = await openCancel()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), 'lý do')
    await userEvent.click(confirmButton(dialog))
    await userEvent.click(confirmButton(dialog))
    expect(cancel).toHaveBeenCalledTimes(1)
    resolve({ data: canceledPo, status: 200 })
  })

  it.each([
    ['GOODS_RECEIPT_EXISTS', 409, /phiếu nhận hàng nên không thể hủy/],
    ['PO_INVALID_STATUS', 409, /Trạng thái đơn không còn hợp lệ/],
  ])('%s: shows the reason in Vietnamese, closes the modal and reloads', async (code, status, text) => {
    const get = getSpy(makePo(), canceledPo)
    vi.spyOn(purchaseOrderApi, 'cancel').mockRejectedValue(new ApiError({ status, code }))
    const { dialog } = await openCancel()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), 'lý do')
    await userEvent.click(confirmButton(dialog))
    expect(await screen.findByText(text)).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('CONCURRENT_UPDATE stays inline so the user can try again', async () => {
    getSpy(makePo())
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel').mockRejectedValueOnce(new ApiError({ status: 409, code: 'CONCURRENT_UPDATE' })).mockResolvedValue({ data: canceledPo, status: 200 })
    const { dialog } = await openCancel()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), 'lý do')
    await userEvent.click(confirmButton(dialog))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('đang được xử lý bởi người khác')
    await userEvent.click(confirmButton(dialog))
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2))
  })

  it('network failure: warns that the outcome is unknown, no auto retry, reloads', async () => {
    const get = getSpy(makePo())
    const cancel = vi.spyOn(purchaseOrderApi, 'cancel').mockRejectedValue(new ApiError({ isNetwork: true }))
    const { dialog } = await openCancel()
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), 'lý do')
    await userEvent.click(confirmButton(dialog))
    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
