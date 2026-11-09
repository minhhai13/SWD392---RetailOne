import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap'
import { PAGE_SIZES, SORT_FIELDS } from '../utils/poQuery'
import { STATUS_META, STATUS_OPTIONS } from '../utils/status'

/** UC23 search / filter / sort controls. Pure presentation: the page owns the URL state. */
export default function PoFilters({ search, onSearch, query, dateError, from, to, onFrom, onTo, onChange, onReset, hasFilters }) {
  return (
    <Form onSubmit={(e) => e.preventDefault()} className="mb-3" role="search" aria-label="Bộ lọc đơn mua hàng">
      <Row className="g-2 align-items-end">
        <Col xs={12} md={6} lg={4}>
          <Form.Label htmlFor="po-search" className="small text-muted mb-1">
            Tìm theo mã đơn hoặc nhà cung cấp
          </Form.Label>
          <InputGroup>
            <InputGroup.Text>
              <i className="bi bi-search" aria-hidden="true" />
            </InputGroup.Text>
            <Form.Control id="po-search" type="search" maxLength={100} placeholder="VD: PO-000012 hoặc tên nhà cung cấp" value={search} onChange={(e) => onSearch(e.target.value)} />
          </InputGroup>
        </Col>
        <Col xs={6} md={3} lg={2}>
          <Form.Label htmlFor="po-status" className="small text-muted mb-1">
            Trạng thái
          </Form.Label>
          <Form.Select id="po-status" value={query.status} onChange={(e) => onChange({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs={6} md={3} lg={2}>
          <Form.Label htmlFor="po-from" className="small text-muted mb-1">
            Từ ngày
          </Form.Label>
          <Form.Control id="po-from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} isInvalid={!!dateError} />
        </Col>
        <Col xs={6} md={3} lg={2}>
          <Form.Label htmlFor="po-to" className="small text-muted mb-1">
            Đến ngày
          </Form.Label>
          <Form.Control id="po-to" type="date" value={to} onChange={(e) => onTo(e.target.value)} isInvalid={!!dateError} />
        </Col>
        <Col xs={6} md={3} lg={2}>
          <Form.Label htmlFor="po-sort" className="small text-muted mb-1">
            Sắp xếp
          </Form.Label>
          <Form.Select id="po-sort" value={`${query.sortBy}:${query.sortDir}`} onChange={(e) => onChange({ sortBy: e.target.value.split(':')[0], sortDir: e.target.value.split(':')[1] })}>
            {Object.entries(SORT_FIELDS).flatMap(([key, label]) => [
              <option key={`${key}:desc`} value={`${key}:desc`}>
                {label} (giảm dần)
              </option>,
              <option key={`${key}:asc`} value={`${key}:asc`}>
                {label} (tăng dần)
              </option>,
            ])}
          </Form.Select>
        </Col>
        <Col xs={6} md={3} lg={2}>
          <Form.Label htmlFor="po-page-size" className="small text-muted mb-1">
            Số dòng / trang
          </Form.Label>
          <Form.Select id="po-page-size" value={query.pageSize} onChange={(e) => onChange({ pageSize: Number(e.target.value) })}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs={12} md="auto">
          <Button variant="outline-secondary" onClick={onReset} disabled={!hasFilters}>
            <i className="bi bi-x-circle me-1" aria-hidden="true" />
            Xóa bộ lọc
          </Button>
        </Col>
      </Row>
      {dateError && (
        <div className="text-danger small mt-2" role="alert">
          {dateError}
        </div>
      )}
    </Form>
  )
}
