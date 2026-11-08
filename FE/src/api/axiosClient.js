import axios from 'axios'
import { getToken } from '../utils/tokenStorage'

// The only place that knows the API address (VITE_API_BASE_URL). Components never hardcode a URL.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { Accept: 'application/json' },
})

/** Normalized error thrown by every API call. */
export class ApiError extends Error {
  constructor({ status = 0, code = null, message = '', details = null, isNetwork = false, isTimeout = false, canceled = false }) {
    super(message || code || 'API error')
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.isNetwork = isNetwork
    this.isTimeout = isTimeout
    this.canceled = canceled
  }
}

export const toApiError = (error) => {
  if (error instanceof ApiError) return error
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') return new ApiError({ canceled: true, message: 'canceled' })
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return new ApiError({ isTimeout: true, message: 'timeout' })
  if (error?.response) {
    const body = error.response.data || {}
    return new ApiError({ status: error.response.status, code: body.code || null, message: body.message || '', details: body.details ?? null })
  }
  if (error?.request) return new ApiError({ isNetwork: true, message: 'network' })
  return new ApiError({ message: error?.message || 'unknown' })
}

let unauthorizedHandler = null
/** AuthContext registers a callback that clears the session when the API answers 401. */
export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler
}

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error)
    // 401 on login means "wrong credentials", not "session expired": the caller opts out with skipUnauthorized
    if (apiError.status === 401 && !error?.config?.skipUnauthorized && unauthorizedHandler) unauthorizedHandler(apiError)
    // 403 is NOT a logout: the caller shows "not enough permission"
    return Promise.reject(apiError)
  },
)

/** Unwraps the backend envelope { success, data, message, meta } and keeps the HTTP status. */
export const unwrap = (response) => ({
  data: response.data?.data,
  message: response.data?.message,
  meta: response.data?.meta,
  status: response.status,
})
