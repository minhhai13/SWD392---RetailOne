import { Table } from 'react-bootstrap'
import { formatQuantity, formatVnd, orDash } from '../../../shared/utils/format'

export default function ItemsTable({ items, totalAmount }) {
  const showReceived = items.some((i) => Number(i.receivedQuantity) > 0)
  return (
    <Table responsive hover className="mb-0" aria-label="Các dòng hàng của đơn">
      <thead className="table-light">
        <tr>
          <th scope="col">#</th>
          <th scope="col">Sản phẩm</th>
          <th scope="col">Đơn vị</th>
          <th scope="col" className="text-end">Số lượng</th>
          <th scope="col" className="text-end">Giá mua</th>
          <th scope="col" className="text-end">Thành tiền</th>
          {showReceived && <th scope="col" className="text-end">Đã nhận</th>}
          <th scope="col">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item.id}>
            <td>{index + 1}</td>
            <td>
              <div className="fw-semibold">{item.productName}</div>
              <div className="small text-muted">{item.productCode}</div>
            </td>
            <td>{item.unitName}</td>
            <td className="text-end">{formatQuantity(item.quantity)}</td>
            <td className="text-end money">{formatVnd(item.costPrice)}</td>
            <td className="text-end money">{formatVnd(item.total)}</td>
            {showReceived && <td className="text-end">{formatQuantity(item.receivedQuantity)}</td>}
            <td>{orDash(item.note)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="table-light">
          <th colSpan={showReceived ? 5 : 5} className="text-end">Tổng tiền</th>
          <th className="text-end money" data-testid="po-total">{formatVnd(totalAmount)}</th>
          <th colSpan={showReceived ? 2 : 1} />
        </tr>
      </tfoot>
    </Table>
  )
}
