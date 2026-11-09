import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card } from 'react-bootstrap'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { purchaseOrderApi } from '../services/purchaseOrderApi'
import { useAuth } from '../../auth/useAuth'
import EmptyState from '../../../shared/components/EmptyState'
import ErrorState from '../../../shared/components/ErrorState'
import LoadingState from '../../../shared/components/LoadingState'
import PageHeader from '../../../shared/components/PageHeader'
import PoFilters from '../components/PoFilters'
import PoPagination from '../components/PoPagination'
import PoTable from '../components/PoTable'
import { useAsync } from '../../../shared/hooks/useAsync'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import { PERMISSIONS } from '../../auth/utils/permissions'
import { parsePoQuery, serializePoQuery, toApiParams } from '../utils/poQuery'
import { validateDateRange } from '../utils/validators'

export const LIST_SEARCH_KEY = 'retailone.poList.search'

/** UC23 - View Purchase Orders. The URL query string is the single source of truth for filter/search/sort/page. */
export default function PurchaseOrderListPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const query = useMemo(() => parsePoQuery(params), [params])
  const paramsKey = params.toString()

  const [searchText, setSearchText] = useState(query.q)
  const [from, setFrom] = useState(query.from)
  const [to, setTo] = useState(query.to)
  const dateError = validateDateRange(from, to)
  const debouncedSearch = useDebounce(searchText, 400)

  const update = useCallback(
    (patch, { replace = false } = {}) => {
      const next = { ...query, ...patch }
      if (!('page' in patch)) next.page = 1 // any filter / sort / page-size change goes back to page 1
      setParams(serializePoQuery(next), { replace })
    },
    [query, setParams],
  )

  // keep the inputs in sync when the URL changes (Back button, reset)
  useEffect(() => setSearchText(query.q), [query.q])
  useEffect(() => setFrom(query.from), [query.from])
  useEffect(() => setTo(query.to), [query.to])

  // debounced search -> URL (replace so typing does not fill the history)
  useEffect(() => {
    if (debouncedSearch.trim() !== query.q) update({ q: debouncedSearch.trim() }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  // remember the list query so the detail page can return to it (also after a reload)
  useEffect(() => {
    try {
      sessionStorage.setItem(LIST_SEARCH_KEY, location.search)
    } catch {
      /* ignore */
    }
  }, [location.search])

  const { status, data, error, reload, isLoading } = useAsync((signal) => purchaseOrderApi.list(toApiParams(query), signal), [paramsKey], { keepData: true })

  const onDate = (setter, key) => (value) => {
    setter(value)
    const nextFrom = key === 'from' ? value : from
    const nextTo = key === 'to' ? value : to
    if (!validateDateRange(nextFrom, nextTo)) update({ [key]: value }) // invalid range: show the error, do not call the API
  }
  const onSort = (field) => update({ sortBy: field, sortDir: query.sortBy === field && query.sortDir === 'desc' ? 'asc' : 'desc' })
  const hasFilters = Boolean(query.status || query.from || query.to || query.q)

  const result = data?.data
  const items = result?.items || []
  const pagination = result?.pagination

  return (
    <>
      <PageHeader
        title="Đơn mua hàng"
        subtitle="Xem, tìm kiếm và theo dõi các đơn mua hàng"
        actions={
          can(PERMISSIONS.CREATE) && (
            <Button as={Link} role="link" to="/purchase-orders/new" variant="primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              Tạo đơn mua hàng
            </Button>
          )
        }
      />
      <Card>
        <Card.Body>
          <PoFilters
            search={searchText}
            onSearch={setSearchText}
            query={query}
            dateError={dateError}
            from={from}
            to={to}
            onFrom={onDate(setFrom, 'from')}
            onTo={onDate(setTo, 'to')}
            onChange={(patch) => update(patch)}
            onReset={() => {
              setSearchText('')
              setParams(serializePoQuery({ ...query, status: '', from: '', to: '', q: '', page: 1 }))
            }}
            hasFilters={hasFilters}
          />

          {status === 'error' && !data && <ErrorState error={error} onRetry={reload} />}
          {status === 'error' && data && <ErrorState error={error} onRetry={reload} />}
          {isLoading && !data && <LoadingState />}

          {data && (
            <div className={isLoading ? 'list-loading' : ''} aria-busy={isLoading}>
              {items.length === 0 ? (
                <EmptyState
                  icon="bi-search"
                  title={hasFilters ? 'Không tìm thấy đơn mua hàng phù hợp' : 'Chưa có đơn mua hàng nào'}
                  description={hasFilters ? 'Hãy thử thay đổi hoặc xóa bộ lọc.' : 'Các đơn mua hàng được tạo sẽ hiển thị tại đây.'}
                >
                  {!hasFilters && can(PERMISSIONS.CREATE) && (
                    <Button as={Link} role="link" to="/purchase-orders/new" variant="primary">
                      Tạo đơn mua hàng đầu tiên
                    </Button>
                  )}
                </EmptyState>
              ) : (
                <>
                  <div className="text-muted small mb-2" data-testid="result-count">
                    Tìm thấy {pagination.total} đơn · trang {pagination.page}/{pagination.totalPages}
                  </div>
                  <PoTable items={items} query={query} onSort={onSort} returnSearch={location.search} />
                  <div className="mt-3">
                    <PoPagination page={pagination.page} totalPages={pagination.totalPages} onChange={(page) => update({ page })} />
                  </div>
                </>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
