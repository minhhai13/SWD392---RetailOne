export default function EmptyState({ icon = 'bi-inbox', title, description, children }) {
  return (
    <div className="text-center text-muted py-5 px-3" data-testid="empty-state">
      <i className={`bi ${icon} display-4 d-block mb-2`} aria-hidden="true" />
      <h2 className="h5">{title}</h2>
      {description && <p className="mb-3">{description}</p>}
      {children}
    </div>
  )
}
