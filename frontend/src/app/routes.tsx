import type { RouteObject } from 'react-router'
import { StatusPage } from '../features/system'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { RootLayout } from './RootLayout'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
