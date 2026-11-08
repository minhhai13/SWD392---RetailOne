import { Button, Form, Table } from 'react-bootstrap'
import { formatVnd } from '../../utils/format'
import { previewTotal } from '../../utils/validators'

/** 22.2: edit quantity / note, remove lines. Prices shown are the backend supply prices (preview only). */
export default function DraftItemsTable({ items, errors, showErrors, dispatch }) {
  return (
    <Table responsive className="mb-0 align-middle" aria-label="Các dòng hàng trong đơn đang soạn">
      <thead className="table-light">
        <tr>
          <th scope="col">Sản phẩm</th>
          <th scope="col">Đơn vị</th>
          <th scope="col" className="text-end">Giá mua</th>
          <th scope="col">Số lượng</th>
          <th scope="col" className="text-end">Thành tiền (tạm tính)</th>
          <th scope="col">Ghi chú dòng</th>
          <th scope="col" className="text-end">
            <span className="visually-hidden">Xóa</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const err = errors.items[item.variantId] || {}
          const qtyError = err.quantity && (showErrors || String(item.quantity).trim() !== '') ? err.quantity : null
          return (
            <tr key={item.variantId} data-variant-id={item.variantId}>
              <td>
                <div className="fw-semibold">{item.productName}</div>
                <div className="small text-muted">{item.productCode}</div>
              </td>
              <td>{item.unitName}</td>
              <td className="text-end money">{formatVnd(item.supplyPrice)}</td>
              <td>
                <Form.Control
                  className="qty-input"
                  inputMode="numeric"
                  aria-label={`Số lượng ${item.productName} (${item.unitName})`}
                  value={item.quantity}
                  onChange={(e) => dispatch({ type: 'setQuantity', variantId: item.variantId, value: e.target.value })}
                  isInvalid={!!qtyError}
                />
                <Form.Control.Feedback type="invalid">{qtyError}</Form.Control.Feedback>
              </td>
              <td className="text-end money">{formatVnd(previewTotal([item]))}</td>
              <td>
                <Form.Control
                  aria-label={`Ghi chú ${item.productName}`}
                  value={item.note}
                  onChange={(e) => dispatch({ type: 'setItemNote', variantId: item.variantId, value: e.target.value })}
                  isInvalid={!!err.note}
                  placeholder="Tùy chọn"
                />
                <Form.Control.Feedback type="invalid">{err.note}</Form.Control.Feedback>
              </td>
              <td className="text-end">
                <Button variant="outline-danger" size="sm" onClick={() => dispatch({ type: 'removeItem', variantId: item.variantId })} aria-label={`Xóa ${item.productName} (${item.unitName})`}>
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
