import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/app-shell'
import { DashboardPage } from './pages/dashboard-page'
import { NewRunPage } from './pages/new-run-page'
import { RunDetailPage } from './pages/run-detail-page'
import { SetupPage } from './pages/setup-page'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export default function App() {
  if (!convex) {
    return <SetupPage />
  }

  return (
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/runs/new" element={<NewRunPage />} />
            <Route path="/runs/:runId" element={<RunDetailPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ConvexProvider>
  )
}
