import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from './services/authApi'
import { setUnauthorizedHandler } from '../../shared/services/apiClient'
import { useToast } from '../../shared/components/ToastProvider'
import { clearToken, getToken, setToken } from './utils/tokenStorage'
import { hasPermission } from './utils/permissions'

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null)

/**
 * status: 'loading' (restoring the session from the token) | 'authenticated' | 'anonymous' | 'error' (backend unreachable).
 * The token lives in sessionStorage; the password is never stored.
 */
export function AuthProvider({ children }) {
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(getToken() ? 'loading' : 'anonymous')
  const [restoreTick, setRestoreTick] = useState(0)
  const [explicitLogout, setExplicitLogout] = useState(false) // after a deliberate logout the next login must not jump back to the old page

  const endSession = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Session restore on reload: GET /auth/me
  useEffect(() => {
    if (!getToken()) return undefined
    const controller = new AbortController()
    let active = true
    authApi
      .me(controller.signal)
      .then((me) => {
        if (!active) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch((err) => {
        if (!active || err?.canceled) return
        if (err.status === 401 || err.status === 403) endSession()
        else setStatus('error') // backend unreachable: offer a retry instead of throwing the session away
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [restoreTick, endSession])

  // 401 anywhere (token expired / revoked) -> clear the session; ProtectedRoute redirects to /login
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!getToken()) return
      endSession()
      toast.warning('Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.', 'Hết phiên')
    })
    return () => setUnauthorizedHandler(null)
  }, [endSession, toast])

  const login = useCallback(async (username, password) => {
    const { token, user: me } = await authApi.login(username, password)
    setToken(token)
    setUser(me)
    setExplicitLogout(false)
    setStatus('authenticated')
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* JWT is stateless: the session is cleared locally anyway */
    }
    setExplicitLogout(true)
    endSession()
  }, [endSession])

  const retryRestore = useCallback(() => {
    setStatus('loading')
    setRestoreTick((t) => t + 1)
  }, [])

  const value = useMemo(
    () => ({ user, status, explicitLogout, isAuthenticated: status === 'authenticated', login, logout, retryRestore, can: (key) => hasPermission(user, key) }),
    [user, status, explicitLogout, login, logout, retryRestore],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
