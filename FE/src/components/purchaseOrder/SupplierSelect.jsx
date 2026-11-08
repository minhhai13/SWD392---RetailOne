import { Form } from 'react-bootstrap'
import ErrorState from '../common/ErrorState'
import LoadingState from '../common/LoadingState'

export default function SupplierSelect({ suppliers, value, onChange, disabled }) {
  const { status, data, error, reload } = suppliers
  if (status === 'loading') return <LoadingState text="Đang tải danh sách nhà cung cấp..." />
  if (status === 'error') return <ErrorState error={error} onRetry={reload} />
  const list = data || []
  if (list.length === 0) return <p className="text-muted mb-0">Hiện chưa có nhà cung cấp nào đang hoạt động.</p>
  const selected = list.find((s) => s.id === value)
  return (
    <>
      <Form.Group controlId="supplier-select">
        <Form.Label>Chọn nhà cung cấp (mỗi đơn chỉ thuộc một nhà cung cấp)</Form.Label>
        <Form.Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} disabled={disabled}>
          <option value="">-- Chọn nhà cung cấp --</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.orderableVariantCount === 0 ? '(chưa có sản phẩm)' : `(${s.orderableVariantCount} sản phẩm)`}
            </option>
          ))}
        </Form.Select>
      </Form.Group>
      {selected && (
        <div className="small text-muted mt-2">
          MST: {selected.taxId} · ĐT: {selected.phoneNumber}
          {selected.address ? ` · ${selected.address}` : ''}
        </div>
      )}
    </>
  )
}
