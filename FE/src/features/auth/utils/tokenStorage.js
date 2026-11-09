// Session token (sessionStorage: cleared when the tab closes). The password is never stored.
const KEY = 'retailone.token'

export const getToken = () => {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
export const setToken = (token) => {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable: the session just will not survive a reload */
  }
}
export const clearToken = () => {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
