// UC23: filter / search / sort / page live in the URL query string (defaults are omitted from the URL).
export const DEFAULT_QUERY = Object.freeze({ page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc' })
export const SORT_FIELDS = Object.freeze({ createdAt: 'Ngày tạo', supplierName: 'Nhà cung cấp', totalAmount: 'Tổng tiền', status: 'Trạng thái' })
export const PAGE_SIZES = [10, 20, 50, 100]

const toInt = (value, fallback, max) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback
}

/** URLSearchParams -> normalized query object (invalid values fall back to defaults). */
export const parsePoQuery = (params) => {
  const sortBy = params.get('sortBy')
  const sortDir = params.get('sortDir')
  return {
    status: params.get('status') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    q: params.get('q') || '',
    sortBy: sortBy && Object.prototype.hasOwnProperty.call(SORT_FIELDS, sortBy) ? sortBy : DEFAULT_QUERY.sortBy,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_QUERY.sortDir,
    page: toInt(params.get('page'), DEFAULT_QUERY.page, 1000000),
    pageSize: toInt(params.get('pageSize'), DEFAULT_QUERY.pageSize, 100),
  }
}

/** Normalized query -> URLSearchParams without empty values or defaults. */
export const serializePoQuery = (query) => {
  const params = new URLSearchParams()
  for (const key of ['status', 'from', 'to', 'q']) if (query[key]) params.set(key, query[key])
  for (const key of ['sortBy', 'sortDir', 'page', 'pageSize']) if (query[key] !== DEFAULT_QUERY[key]) params.set(key, String(query[key]))
  return params
}

/** Query object -> params for the API (only non-empty values). */
export const toApiParams = (query) => {
  const params = { sortBy: query.sortBy, sortDir: query.sortDir, page: query.page, pageSize: query.pageSize }
  for (const key of ['status', 'from', 'to', 'q']) if (query[key]) params[key] = query[key]
  return params
}
