import { Badge } from 'react-bootstrap'
import { statusMeta } from '../../features/purchase-order/utils/status'

export default function StatusBadge({ status }) {
  const meta = statusMeta(status)
  return (
    <Badge bg={meta.bg} text={meta.text} className="status-badge" data-status={status}>
      <i className={`bi ${meta.icon} me-1`} aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}
