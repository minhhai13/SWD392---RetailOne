import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '../features/auth'
import { ToastProvider } from '../shared/components/ToastProvider'
import { routes } from './routes'

export default function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  )
}
