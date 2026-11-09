import { useMemo, useState } from 'react'
import { Button, Form, InputGroup, Table } from 'react-bootstrap'
import { formatVnd } from '../../../shared/utils/format'
import EmptyState from '../../../shared/components/EmptyState'
import ErrorState from '../../../shared/components/ErrorState'
import LoadingState from '../../../shared/components/LoadingState'

const normalize = (s) => String(s || '').toLowerCase()

/** Catalog of the selected supplier with the CURRENT supply price from the backend. */
export default function CatalogPicker({ catalog, addedIds, onAdd }) {
  const [search, setSearch] = useState('')
  const { status, data, error, reload } = catalog
  const items = useMemo(() => data?.items || [], [data])
  const filtered = useMemo(() => {
    const term = normalize(search).trim()
    if (!term) return items
    return items.filter((i) => [i.productName, i.productCode, i.unitName, i.barcode].some((v) => normalize(v).includes(term)))
  }, [items, search])

  if (status === 'loading') return <LoadingState text="Đang tải sản phẩm và giá mua..." />
  if (status === 'error') return <ErrorState error={error} onRetry={reload} />
  if (items.length === 0) {
    return (
      <EmptyState icon="bi-box" title="Nhà cung cấp này chưa có sản phẩm để đặt hàng" description="Vui lòng chọn nhà cung cấp khác hoặc hủy việc tạo đơn." />
    )
  }
  return (
    <>
      <InputGroup className="mb-2">
        <InputGroup.Text>
          <i className="bi bi-search" aria-hidden="true" />
        </InputGroup.Text>
        <Form.Control type="search" aria-label="Tìm sản phẩm trong danh mục" placeholder="Tìm theo tên, mã, đơn vị hoặc mã vạch" value={search} onChange={(e) => setSearch(e.target.value)} />
      </InputGroup>
      {filtered.length === 0 ? (
        <p className="text-muted my-3 text-center">Không có sản phẩm nào khớp "{search}".</p>
      ) : (
        <div className="catalog-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <Table responsive hover size="sm" className="mb-0" aria-label="Danh mục sản phẩm của nhà cung cấp">
            <thead className="table-light">
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Đơn vị</th>
                <th scope="col" className="text-end">Giá mua</th>
                <th scope="col" className="text-end">Thêm</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const added = addedIds.has(item.variantId)
                return (
                  <tr key={item.variantId}>
                    <td>
                      <div className="fw-semibold">{item.productName}</div>
                      <div className="small text-muted">{item.productCode}</div>
                    </td>
                    <td>{item.unitName}</td>
                    <td className="text-end money">{formatVnd(item.supplyPrice)}</td>
                    <td className="text-end">
                      <Button size="sm" variant={added ? 'outline-secondary' : 'outline-primary'} disabled={added} onClick={() => onAdd(item)} aria-label={`${added ? 'Đã thêm' : 'Thêm'} ${item.productName} (${item.unitName})`}>
                        {added ? (
                          <>
                            <i className="bi bi-check2 me-1" aria-hidden="true" />
                            Đã thêm
                          </>
                        ) : (
                          <>
                            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                            Thêm
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </div>
      )}
    </>
  )
}
