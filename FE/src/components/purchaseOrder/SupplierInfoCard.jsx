import { Card, Col, Row } from 'react-bootstrap'
import { orDash } from '../../utils/format'

/** The supplier shown here is the SNAPSHOT taken when the PO was created (BR-84), not the current supplier record. */
export default function SupplierInfoCard({ supplier }) {
  return (
    <Card className="h-100">
      <Card.Header className="bg-white fw-semibold">
        <i className="bi bi-truck me-2" aria-hidden="true" />
        Nhà cung cấp
      </Card.Header>
      <Card.Body>
        <Row as="dl" className="mb-2">
          <Col sm={4} as="dt" className="text-muted fw-normal">Tên</Col>
          <Col sm={8} as="dd">{orDash(supplier?.name)}</Col>
          <Col sm={4} as="dt" className="text-muted fw-normal">Mã số thuế</Col>
          <Col sm={8} as="dd">{orDash(supplier?.taxId)}</Col>
          <Col sm={4} as="dt" className="text-muted fw-normal">Điện thoại</Col>
          <Col sm={8} as="dd">{orDash(supplier?.phoneNumber)}</Col>
          <Col sm={4} as="dt" className="text-muted fw-normal">Địa chỉ</Col>
          <Col sm={8} as="dd" className="mb-0">{orDash(supplier?.address)}</Col>
        </Row>
        <div className="small text-muted">Thông tin tại thời điểm tạo đơn (không thay đổi khi nhà cung cấp cập nhật hồ sơ).</div>
      </Card.Body>
    </Card>
  )
}
