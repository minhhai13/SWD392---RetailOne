import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Toast, ToastContainer } from 'react-bootstrap'

const ToastContext = createContext(null)
const ICONS = { success: 'bi-check-circle-fill', danger: 'bi-exclamation-octagon-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }
const DURATIONS = { success: 5000, info: 6000, warning: 9000, danger: 9000 }
const MAX_VISIBLE = 4

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback((variant, message, title) => {
    setToasts((list) => {
      if (list.some((t) => t.message === message && t.variant === variant)) return list // do not spam identical toasts
      const id = nextId.current++
      return [...list, { id, variant, message, title }].slice(-MAX_VISIBLE)
    })
  }, [])

  const api = useMemo(
    () => ({
      success: (message, title = 'Thành công') => push('success', message, title),
      error: (message, title = 'Có lỗi xảy ra') => push('danger', message, title),
      warning: (message, title = 'Lưu ý') => push('warning', message, title),
      info: (message, title = 'Thông báo') => push('info', message, title),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer position="top-end" className="p-3 app-toasts" style={{ zIndex: 2000 }}>
        {toasts.map((t) => (
          <Toast key={t.id} bg={t.variant} onClose={() => dismiss(t.id)} show autohide delay={DURATIONS[t.variant]}>
            <Toast.Header closeButton>
              <i className={`bi ${ICONS[t.variant]} me-2 text-${t.variant}`} aria-hidden="true" />
              <strong className="me-auto">{t.title}</strong>
            </Toast.Header>
            <Toast.Body className={t.variant === 'warning' || t.variant === 'info' ? '' : 'text-white'}>{t.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
