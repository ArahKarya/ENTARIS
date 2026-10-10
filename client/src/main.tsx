import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { MotionProvider } from './contexts/MotionContext'
import { ThemedToaster } from './components/ThemedToaster'
import VersionWatcher from './components/VersionWatcher'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MotionProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <App />
            <VersionWatcher />
            <ThemedToaster />
          </QueryClientProvider>
        </ErrorBoundary>
      </MotionProvider>
    </ThemeProvider>
  </StrictMode>,
)
