import { Button, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import StatusBadge from '../../../shared/components/StatusBadge'
import { formatDateTime, formatVnd } from '../../../shared/utils/format'

const SortableTh = ({ field, label, query, onSort, className }) => {
  const active = query.sortBy === field
  const ariaSort = active ? (query.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th className={`sortable ${className || ''}`} onClick={() => onSort(field)} aria-sort={ariaSort} scope="col">
      {label}
      <i className={`bi ms-1 ${active ? (query.sortDir === 'asc' ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up text-muted'}`} aria-hidden="true" />
    </th>
  )
}

/** UC23 table. `returnSearch` is the list query string so the detail page can return with the same filters. */
export default function PoTable({ items, query, onSort, returnSearch }) {
  return (
    <Table responsive hover className="mb-0 align-middle" aria-label="Danh sách đơn mua hàng">
      <thead className="table-light">
        <tr>
          <th scope="col">Mã đơn</th>
          <SortableTh field="createdAt" label="Ngày tạo" query={query} onSort={onSort} />
          <SortableTh field="supplierName" label="Nhà cung cấp" query={query} onSort={onSort} />
          <th scope="col">Người tạo</th>
          <SortableTh field="totalAmount" label="Tổng tiền" query={query} onSort={onSort} className="text-end" />
          <SortableTh field="status" label="Trạng thái" query={query} onSort={onSort} />
          <th scope="col" className="text-center">Số dòng</th>
          <th scope="col" className="text-end">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {items.map((po) => (
          <tr key={po.id}>
            <td className="fw-semibold">{po.poCode}</td>
            <td>{formatDateTime(po.createdAt)}</td>
            <td>{po.supplierName}</td>
            <td>{po.createdByName || '—'}</td>
            <td className="text-end money">{formatVnd(po.totalAmount)}</td>
            <td>
              <StatusBadge status={po.status} />
            </td>
            <td className="text-center">{po.itemCount}</td>
            <td className="text-end">
              <Button as={Link} role="link" to={`/purchase-orders/${po.id}`} state={{ fromSearch: returnSearch }} size="sm" variant="outline-primary" aria-label={`Xem chi tiết ${po.poCode}`}>
                <i className="bi bi-eye me-1" aria-hidden="true" />
                Xem
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
