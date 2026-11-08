import { apiClient, unwrap } from './axiosClient'

export const authApi = {
  /** POST /auth/login -> { token, user } (the token is in data.token) */
  login: async (username, password) => unwrap(await apiClient.post('/auth/login', { username, password }, { skipUnauthorized: true })).data,
  /** GET /auth/me -> user { id, username, staffId, fullName, role:{name}, permissions[], requirePasswordChange } */
  me: async (signal) => unwrap(await apiClient.get('/auth/me', { signal })).data,
  logout: async () => unwrap(await apiClient.post('/auth/logout')),
}
