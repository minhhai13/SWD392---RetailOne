import { formatDateTime, formatStaff } from '../../utils/format'
import { STATUS_META, TIMELINE_LABELS } from '../../utils/status'

const EVENT_STYLE = { CREATED: ['warning', 'bi-plus-lg'], APPROVED: ['success', 'bi-check-lg'], RECEIVED: ['primary', 'bi-box-seam'], CANCELED: ['danger', 'bi-x-lg'] }

/** Derived from lifecycle timestamps only - NOT a complete audit log (OPEN-QUESTIONS Q3). */
export default function Timeline({ timeline }) {
  return (
    <div>
      <ol className="timeline" aria-label="Dòng thời gian của đơn">
        {timeline.map((entry) => {
          const [color, icon] = EVENT_STYLE[entry.event] || ['secondary', 'bi-circle']
          return (
            <li key={`${entry.event}-${entry.at}`} className="timeline-item" data-event={entry.event}>
              <span className={`timeline-dot bg-${color}`}>
                <i className={`bi ${icon}`} aria-hidden="true" />
              </span>
              <div className="fw-semibold">{TIMELINE_LABELS[entry.event] || STATUS_META[entry.event]?.label || entry.event}</div>
              <div className="small text-muted">
                {formatDateTime(entry.at)} · {formatStaff(entry.by)}
              </div>
              {entry.reason && <div className="small mt-1">Lý do: {entry.reason}</div>}
            </li>
          )
        })}
      </ol>
      <div className="small text-muted mt-3">Các mốc được suy ra từ thời gian lưu trong đơn, không phải nhật ký thay đổi đầy đủ.</div>
    </div>
  )
}
