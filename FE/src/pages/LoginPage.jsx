import { useState } from 'react'
import { Alert, Button, Card, Form, InputGroup, Spinner } from 'react-bootstrap'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from '../utils/errorMessages'

export default function LoginPage() {
  const { login, isAuthenticated, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from
  const target = from ? `${from.pathname}${from.search || ''}` : '/purchase-orders'

  const [form, setForm] = useState({ username: '', password: '' })
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (isAuthenticated) return <Navigate to={target} replace />

  const errors = {
    username: form.username.trim() ? null : 'Vui lòng nhập tên đăng nhập.',
    password: form.password ? null : 'Vui lòng nhập mật khẩu.',
  }
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setTouched({ username: true, password: true })
    if (errors.username || errors.password || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(form.username.trim(), form.password)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page d-flex align-items-center justify-content-center p-3">
      <Card className="login-card shadow">
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            <i className="bi bi-shop display-5 text-primary" aria-hidden="true" />
            <h1 className="h3 mt-2 mb-0">RetailOne</h1>
            <p className="text-muted mb-0">Quản lý đơn mua hàng</p>
          </div>
          {status === 'error' && <Alert variant="warning">Không kết nối được máy chủ. Vui lòng kiểm tra backend.</Alert>}
          {error && (
            <Alert variant="danger" data-testid="login-error">
              {getErrorMessage(error)}
            </Alert>
          )}
          <Form onSubmit={onSubmit} noValidate>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Tên đăng nhập</Form.Label>
              <Form.Control autoFocus autoComplete="username" value={form.username} onChange={set('username')} onBlur={blur('username')} isInvalid={touched.username && !!errors.username} disabled={submitting} />
              <Form.Control.Feedback type="invalid">{errors.username}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-4" controlId="password">
              <Form.Label>Mật khẩu</Form.Label>
              <InputGroup hasValidation>
                <Form.Control type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={set('password')} onBlur={blur('password')} isInvalid={touched.password && !!errors.password} disabled={submitting} />
                <Button variant="outline-secondary" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword}>
                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
                </Button>
                <Form.Control.Feedback type="invalid">{errors.password}</Form.Control.Feedback>
              </InputGroup>
            </Form.Group>
            <Button type="submit" className="w-100" disabled={submitting}>
              {submitting && <Spinner as="span" animation="border" size="sm" className="me-2" />}
              Đăng nhập
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}
