import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/shared/services/apiClient'
import { purchaseOrderApi } from '../../src/features/purchase-order/services/purchaseOrderApi'
import { supplierApi } from '../../src/features/purchase-order/services/supplierApi'
import { isValidIdempotencyKey } from '../../src/features/purchase-order/utils/idempotency'
import { makePo, renderApp, USERS } from '../helpers'

const SUPPLIERS = [
  { id: 1, name: 'NCC Thực Phẩm', taxId: '0100000001', phoneNumber: '0281000001', address: '12 Nguyễn Huệ', status: 'Active', orderableVariantCount: 3 },
  { id: 2, name: 'NCC Đồ Uống', taxId: '0100000002', phoneNumber: '0281000002', address: null, status: 'Active', orderableVariantCount: 2 },
  { id: 3, name: 'NCC Trống', taxId: '0100000003', phoneNumber: '0281000003', address: null, status: 'Active', orderableVariantCount: 0 },
]
const CATALOG = {
  1: [
    { variantId: 10, productId: 5, productCode: 'RICE', productName: 'Gạo ST25', baseUnit: 'bag', unitName: 'bag', conversionFactor: 1, barcode: null, unitType: 'PIECE', supplyPrice: 95000, priceUpdatedAt: '2026-10-01T00:00:00Z' },
    { variantId: 11, productId: 6, productCode: 'NOODLE', productName: 'Mì Hảo Hảo', baseUnit: 'pack', unitName: 'pack', conversionFactor: 1, barcode: null, unitType: 'PIECE', supplyPrice: 3200.5, priceUpdatedAt: '2026-10-01T00:00:00Z' },
    { variantId: 12, productId: 7, productCode: 'MILK', productName: 'Sữa tươi', baseUnit: 'carton', unitName: 'carton', conversionFactor: 1, barcode: null, unitType: 'PIECE', supplyPrice: 30000, priceUpdatedAt: '2026-10-01T00:00:00Z' },
  ],
  2: [{ variantId: 20, productId: 8, productCode: 'TEA', productName: 'Trà xanh', baseUnit: 'bottle', unitName: 'bottle', conversionFactor: 1, barcode: null, unitType: 'PIECE', supplyPrice: 8500, priceUpdatedAt: '2026-10-01T00:00:00Z' }],
  3: [],
}

const setup = (user = USERS.warehouse) => {
  vi.spyOn(supplierApi, 'listSuppliers').mockResolvedValue(SUPPLIERS)
  const catalog = vi.spyOn(supplierApi, 'getCatalog').mockImplementation(async (id) => ({ supplier: SUPPLIERS.find((s) => s.id === Number(id)), items: CATALOG[id] }))
  vi.spyOn(purchaseOrderApi, 'list').mockResolvedValue({ data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, status: 200 })
  vi.spyOn(purchaseOrderApi, 'get').mockResolvedValue({ data: makePo({ id: 55, poCode: 'PO-000055' }), status: 200 })
  const r = renderApp('/purchase-orders/new', { user })
  return { ...r, catalog }
}
const chooseSupplier = async (id) => userEvent.selectOptions(await screen.findByLabelText(/Chọn nhà cung cấp/), String(id))
const addProduct = async (name) => userEvent.click(await screen.findByRole('button', { name: new RegExp(`^Thêm ${name}`) }))
const qty = (name) => screen.getByLabelText(new RegExp(`^Số lượng ${name}`))
const submitButton = () => screen.getByRole('button', { name: 'Tạo đơn mua hàng' })
const created = (id = 55, extra = {}) => ({ data: { id, poCode: `PO-0000${id}`, status: 'PENDING' }, status: 201, ...extra })

describe('UC22 - Create Purchase Order: flow (FE-UC22-A)', () => {
  it('loads active suppliers from the API and then the catalog with supply prices of the chosen supplier', async () => {
    const { catalog } = setup()
    expect(await screen.findByRole('option', { name: /NCC Thực Phẩm \(3 sản phẩm\)/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /NCC Trống \(chưa có sản phẩm\)/ })).toBeInTheDocument()
    await chooseSupplier(1)
    expect(await screen.findByText('Gạo ST25')).toBeInTheDocument()
    expect(catalog).toHaveBeenCalledWith(1, expect.anything())
    const table = screen.getByRole('table', { name: 'Danh mục sản phẩm của nhà cung cấp' })
    expect(within(table).getByText(/95\.000/)).toBeInTheDocument()
    expect(within(table).getByText(/3\.200,5/)).toBeInTheDocument() // decimal price not rounded
  })

  it('catalog search filters the products (22.0.5)', async () => {
    setup()
    await chooseSupplier(1)
    await screen.findByText('Gạo ST25')
    await userEvent.type(screen.getByLabelText('Tìm sản phẩm trong danh mục'), 'sữa')
    expect(screen.queryByText('Gạo ST25')).not.toBeInTheDocument()
    expect(screen.getByText('Sữa tươi')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Tìm sản phẩm trong danh mục'))
    await userEvent.type(screen.getByLabelText('Tìm sản phẩm trong danh mục'), 'zzzz')
    expect(screen.getByText(/Không có sản phẩm nào khớp/)).toBeInTheDocument()
  })

  it('adds items, previews the total from API prices, a variant cannot be added twice', async () => {
    setup()
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/95\.000/)
    await userEvent.clear(qty('Gạo ST25'))
    await userEvent.type(qty('Gạo ST25'), '10')
    await addProduct('Mì Hảo Hảo')
    await userEvent.clear(qty('Mì Hảo Hảo'))
    await userEvent.type(qty('Mì Hảo Hảo'), '3')
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/959\.601,5/) // 10*95000 + 3*3200.5
    expect(screen.getByRole('button', { name: /^Đã thêm Gạo ST25/ })).toBeDisabled()
    expect(screen.getAllByRole('row').filter((r) => r.getAttribute('data-variant-id') === '10')).toHaveLength(1)
  })

  it('22.2 edits the draft: change quantity, remove an item, add another - the total follows', async () => {
    setup()
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await addProduct('Sữa tươi')
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/125\.000/)
    await userEvent.clear(qty('Gạo ST25'))
    await userEvent.type(qty('Gạo ST25'), '2')
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/220\.000/)
    await userEvent.click(screen.getByRole('button', { name: /^Xóa Sữa tươi/ }))
    expect(screen.queryByLabelText(/^Số lượng Sữa tươi/)).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/190\.000/)
    await addProduct('Mì Hảo Hảo')
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/193\.200,5/)
    expect(screen.getByRole('button', { name: /^Thêm Sữa tươi/ })).toBeEnabled() // removed items can be added again
  })

  it('submits the exact body (no price / total / status / actor / snapshot) and opens the new PO in PENDING (22.0.8)', async () => {
    const { router } = setup()
    const create = vi.spyOn(purchaseOrderApi, 'create').mockResolvedValue(created(55))
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await addProduct('Mì Hảo Hảo')
    await userEvent.clear(qty('Gạo ST25'))
    await userEvent.type(qty('Gạo ST25'), '10')
    await userEvent.type(screen.getByLabelText('Ghi chú Gạo ST25'), 'giao buổi sáng')
    await userEvent.type(screen.getByLabelText('Ghi chú đơn (tùy chọn)'), 'Đơn bổ sung hàng')
    await userEvent.click(submitButton())
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const [body, key] = create.mock.calls[0]
    expect(body).toEqual({ supplierId: 1, note: 'Đơn bổ sung hàng', items: [{ variantId: 10, quantity: 10, note: 'giao buổi sáng' }, { variantId: 11, quantity: 1 }] })
    const sent = JSON.stringify(body)
    for (const forbidden of ['costPrice', 'total', 'totalAmount', 'poCode', 'status', 'createdBy', 'approvedBy', 'managerId', 'supplierName', 'supplyPrice']) expect(sent).not.toContain(`"${forbidden}"`)
    expect(isValidIdempotencyKey(key)).toBe(true)
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/55'))
    expect(await screen.findByText(/Đã tạo đơn mua hàng PO-000055 ở trạng thái chờ duyệt/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /PO-000055/ })).toBeInTheDocument()
  })

  it('Manager can create too', async () => {
    const { router } = setup(USERS.manager)
    vi.spyOn(purchaseOrderApi, 'create').mockResolvedValue(created(56))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/56'))
  })

  it('a double click creates only one order', async () => {
    setup()
    let resolve
    const create = vi.spyOn(purchaseOrderApi, 'create').mockImplementation(() => new Promise((r) => (resolve = r)))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    await userEvent.click(submitButton())
    expect(create).toHaveBeenCalledTimes(1)
    resolve(created(57))
  })

  it('changing supplier with items asks for confirmation; keep / change (22.0 supplier rules)', async () => {
    const { catalog } = setup()
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await userEvent.selectOptions(screen.getByLabelText(/Chọn nhà cung cấp/), '2')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('xóa 1 dòng hàng')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Chọn nhà cung cấp/)).toHaveValue('1')
    expect(qty('Gạo ST25')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(/Chọn nhà cung cấp/), '2')
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Đổi và xóa/ }))
    expect(await screen.findByText('Trà xanh')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Số lượng Gạo/)).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-total')).toHaveTextContent(/^0/)
    expect(catalog).toHaveBeenLastCalledWith(2, expect.anything())
  })

  it('changing supplier without items does not ask', async () => {
    setup()
    await chooseSupplier(1)
    await screen.findByText('Gạo ST25')
    await chooseSupplier(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Trà xanh')).toBeInTheDocument()
  })

  it('a slow catalog of the previous supplier never overwrites the new one (race)', async () => {
    vi.spyOn(supplierApi, 'listSuppliers').mockResolvedValue(SUPPLIERS)
    let resolveOld
    vi.spyOn(supplierApi, 'getCatalog').mockImplementation((id) => (Number(id) === 1 ? new Promise((r) => (resolveOld = r)) : Promise.resolve({ supplier: SUPPLIERS[1], items: CATALOG[2] })))
    renderApp('/purchase-orders/new', { user: USERS.warehouse })
    await chooseSupplier(1)
    await chooseSupplier(2)
    expect(await screen.findByText('Trà xanh')).toBeInTheDocument()
    resolveOld({ supplier: SUPPLIERS[0], items: CATALOG[1] })
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText('Gạo ST25')).not.toBeInTheDocument()
  })
})

describe('UC22 - validation and exceptions (FE-UC22-B)', () => {
  it('empty items: warning, nothing sent (22.0.E1)', async () => {
    setup()
    const create = vi.spyOn(purchaseOrderApi, 'create')
    await screen.findByLabelText(/Chọn nhà cung cấp/) // session restored and page rendered
    await userEvent.click(submitButton())
    expect(await screen.findByText('Vui lòng chọn nhà cung cấp.')).toBeInTheDocument()
    await chooseSupplier(1)
    await screen.findByText('Gạo ST25')
    await userEvent.click(submitButton())
    expect(await screen.findByText('Vui lòng thêm ít nhất một sản phẩm.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([['0'], ['-3'], ['1.5'], ['abc'], ['']])('invalid quantity "%s" is shown at the field and blocks the request (22.0.E1)', async (bad) => {
    setup()
    const create = vi.spyOn(purchaseOrderApi, 'create')
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await userEvent.clear(qty('Gạo ST25'))
    if (bad) await userEvent.type(qty('Gạo ST25'), bad)
    await userEvent.click(submitButton())
    expect(qty('Gạo ST25')).toHaveClass('is-invalid')
    expect(screen.getByText(/Vui lòng nhập số lượng|Số lượng phải/)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('supplier with no catalog: explanatory empty state, nothing can be added (22.0.E2)', async () => {
    setup()
    await chooseSupplier(3)
    expect(await screen.findByText('Nhà cung cấp này chưa có sản phẩm để đặt hàng')).toBeInTheDocument()
    expect(screen.getByText(/chọn nhà cung cấp khác hoặc hủy/)).toBeInTheDocument()
  })

  it('catalog / supplier loading errors show Retry', async () => {
    vi.spyOn(supplierApi, 'listSuppliers').mockRejectedValueOnce(new ApiError({ isNetwork: true })).mockResolvedValue(SUPPLIERS)
    renderApp('/purchase-orders/new', { user: USERS.warehouse })
    expect(await screen.findByTestId('error-state')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
    expect(await screen.findByLabelText(/Chọn nhà cung cấp/)).toBeInTheDocument()
  })

  it('catalog for an inactive supplier (422) shows the message', async () => {
    vi.spyOn(supplierApi, 'listSuppliers').mockResolvedValue(SUPPLIERS)
    vi.spyOn(supplierApi, 'getCatalog').mockRejectedValue(new ApiError({ status: 422, code: 'SUPPLIER_INACTIVE' }))
    renderApp('/purchase-orders/new', { user: USERS.warehouse })
    await chooseSupplier(1)
    expect(await screen.findByTestId('error-state')).toHaveTextContent('Nhà cung cấp đã ngừng hoạt động.')
  })

  it.each([
    ['VARIANT_NOT_SUPPLIED', 422, /không thuộc nhà cung cấp đã chọn/],
    ['PRODUCT_INACTIVE', 422, /ngừng bán/],
    ['PRICE_NOT_CONFIGURED', 422, /chưa có giá mua hợp lệ/],
  ])('%s: message + the affected products, the draft is kept', async (code, status, text) => {
    setup()
    vi.spyOn(purchaseOrderApi, 'create').mockRejectedValue(new ApiError({ status, code, details: { variantIds: [11] } }))
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await addProduct('Mì Hảo Hảo')
    await userEvent.click(submitButton())
    const alert = await screen.findByTestId('submit-error')
    expect(alert).toHaveTextContent(text)
    expect(within(alert).getByText(/Mì Hảo Hảo/)).toBeInTheDocument()
    expect(within(alert).queryByText(/Gạo ST25/)).not.toBeInTheDocument()
    expect(qty('Gạo ST25')).toHaveValue('1') // draft untouched
    expect(qty('Mì Hảo Hảo')).toBeInTheDocument()
  })

  it('409 conflict (idempotency key reused) keeps the draft and explains', async () => {
    setup()
    vi.spyOn(purchaseOrderApi, 'create').mockRejectedValue(new ApiError({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    expect(await screen.findByTestId('submit-error')).toHaveTextContent('trùng khóa')
    expect(qty('Trà xanh')).toBeInTheDocument()
  })

  it('403 on create: not enough permission, session kept', async () => {
    const { router } = setup()
    vi.spyOn(purchaseOrderApi, 'create').mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN' }))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    expect(await screen.findByTestId('submit-error')).toHaveTextContent('không đủ quyền')
    expect(router.state.location.pathname).toBe('/purchase-orders/new')
  })
})

describe('UC22 - unknown outcome, idempotency, post-COMMIT (FE-UC22-C)', () => {
  it('network failure: draft kept, NO automatic retry; manual retry reuses the same Idempotency-Key', async () => {
    const { router } = setup()
    const create = vi.spyOn(purchaseOrderApi, 'create').mockRejectedValueOnce(new ApiError({ isNetwork: true })).mockResolvedValue(created(58, { status: 200 }))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    const alert = await screen.findByTestId('submit-error')
    expect(alert).toHaveTextContent('Chưa xác định được kết quả')
    expect(alert).toHaveTextContent('không tự gửi lại')
    expect(screen.getByRole('link', { name: 'danh sách đơn mua hàng' })).toHaveAttribute('target', '_blank')
    await new Promise((r) => setTimeout(r, 50))
    expect(create).toHaveBeenCalledTimes(1)
    expect(qty('Trà xanh')).toBeInTheDocument()

    await userEvent.click(submitButton()) // user decides to retry
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1][1]).toBe(create.mock.calls[0][1]) // same key, same payload
    expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0])
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/58'))
  })

  it('an edited draft gets a NEW key after a failure (same key + different body would be rejected)', async () => {
    setup()
    const create = vi.spyOn(purchaseOrderApi, 'create').mockRejectedValueOnce(new ApiError({ isTimeout: true })).mockResolvedValue(created(59))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    await screen.findByTestId('submit-error')
    expect(screen.getByTestId('submit-error')).toHaveTextContent('phản hồi quá lâu')
    await userEvent.clear(qty('Trà xanh'))
    await userEvent.type(qty('Trà xanh'), '9')
    await userEvent.click(submitButton())
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1][1]).not.toBe(create.mock.calls[0][1])
    expect(create.mock.calls[1][0].items[0].quantity).toBe(9)
  })

  it('COMMIT_OUTCOME_UNKNOWN: neither success nor failure is claimed, no retry, sending is blocked until the user confirms they checked', async () => {
    setup()
    const create = vi.spyOn(purchaseOrderApi, 'create').mockRejectedValue(new ApiError({ status: 500, code: 'COMMIT_OUTCOME_UNKNOWN' }))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    const alert = await screen.findByTestId('submit-error')
    expect(alert).toHaveTextContent('Chưa xác định được kết quả')
    expect(alert).toHaveTextContent('Chưa xác định được thao tác đã được lưu hay chưa')
    expect(alert).not.toHaveTextContent('Không tạo được đơn')
    expect(submitButton()).toBeDisabled()
    await new Promise((r) => setTimeout(r, 50))
    expect(create).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByLabelText(/Tôi đã kiểm tra danh sách/))
    expect(submitButton()).toBeEnabled()
  })

  it('idempotent replay (HTTP 200) is treated as the earlier result: no second order, tells the user', async () => {
    const { router } = setup()
    vi.spyOn(purchaseOrderApi, 'create').mockResolvedValue(created(60, { status: 200 }))
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    expect(await screen.findByText(/đã được xử lý trước đó/)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/60'))
  })

  it('meta.detailLoaded=false: counts as created, does not resend, opens the detail page which loads the PO', async () => {
    const { router } = setup()
    const create = vi.spyOn(purchaseOrderApi, 'create').mockResolvedValue({ data: { id: 61, poCode: 'PO-000061', status: 'PENDING' }, meta: { detailLoaded: false }, status: 201 })
    await chooseSupplier(2)
    await addProduct('Trà xanh')
    await userEvent.click(submitButton())
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/61'))
    expect(await screen.findByText(/chưa tải được chi tiết/)).toBeInTheDocument()
    expect(purchaseOrderApi.get).toHaveBeenCalledWith('61', expect.anything())
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('UC22 - cancel / leave (22.3) (FE-UC22-D)', () => {
  it('Hủy with an unchanged draft goes straight back to the list', async () => {
    const { router } = setup()
    await screen.findByLabelText(/Chọn nhà cung cấp/)
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('choosing a supplier alone is not a change', async () => {
    const { router } = setup()
    await chooseSupplier(1)
    await screen.findByText('Gạo ST25')
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
  })

  it('Hủy with a changed draft asks for confirmation; staying keeps the draft, leaving discards it (nothing is saved)', async () => {
    const { router } = setup()
    const create = vi.spyOn(purchaseOrderApi, 'create')
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Hệ thống không lưu bản nháp')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ở lại soạn tiếp' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/purchase-orders/new')
    expect(qty('Gạo ST25')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rời trang' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders'))
    expect(create).not.toHaveBeenCalled()
  })

  it('navigating away through the sidebar with a changed draft is also guarded', async () => {
    const { router } = setup()
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    await userEvent.click(screen.getByRole('link', { name: /^Đơn mua hàng$/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Rời khỏi trang tạo đơn?')
    expect(router.state.location.pathname).toBe('/purchase-orders/new')
  })

  it('registers a beforeunload guard only while the draft is changed', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    setup()
    await chooseSupplier(1)
    await addProduct('Gạo ST25')
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true)
  })

  it('a note typed alone makes the draft changed', async () => {
    setup()
    await userEvent.type(await screen.findByLabelText('Ghi chú đơn (tùy chọn)'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
