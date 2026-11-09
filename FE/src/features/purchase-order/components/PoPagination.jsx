import { Pagination } from 'react-bootstrap'
import { pageWindow } from '../utils/pagination'

export default function PoPagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null
  return (
    <Pagination className="mb-0 flex-wrap justify-content-center" aria-label="Phân trang">
      <Pagination.Prev disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước" />
      {pageWindow(page, totalPages).map((item) =>
        typeof item === 'string' ? (
          <Pagination.Ellipsis key={item} disabled />
        ) : (
          <Pagination.Item key={item} active={item === page} onClick={() => onChange(item)} aria-label={`Trang ${item}`}>
            {item}
          </Pagination.Item>
        ),
      )}
      <Pagination.Next disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Trang sau" />
    </Pagination>
  )
}
