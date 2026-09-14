import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderFatalError(error) {
  const rootEl = document.getElementById('root') || document.body
  const message = error && error.message ? error.message : String(error)
  const stack = error && error.stack ? error.stack : ''
  rootEl.innerHTML =
    '<pre style="white-space: pre-wrap; word-break: break-word; font-family: monospace; ' +
    'background: #fff8f8; color: #58151c; padding: 1.5rem; margin: 0; min-height: 100vh; ' +
    'box-sizing: border-box; font-size: 0.9rem;">' +
    'The app failed to start.\n\n' +
    escapeHtml(message) +
    '\n\n' +
    escapeHtml(stack) +
    '</pre>'
}

// This only catches errors thrown synchronously while React performs the initial
// mount (for example createRoot failing because #root is missing, or a render error
// escaping without an ErrorBoundary in place). It cannot catch errors thrown while
// this file's own imports are being evaluated -- those happen before this try block
// even runs. That earlier case is handled inside src/lib/supabaseClient.js itself.
try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </StrictMode>,
  )
} catch (error) {
  console.error('Fatal error while starting the app:', error)
  renderFatalError(error)
}