import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage.jsx'
import LoginForm from './components/LoginForm.jsx'
import SignupForm from './components/SignUpForm.jsx'
import ForgotPassword from './pages/ForgotPassword'
import NewPassword from './pages/NewPassword'
import Dashboard from './pages/Dashboard.jsx'
import {supabase} from './utils/supabase.js'

function MainFlow() {
  const [view, setView] = useState('landing')

  if (view === 'landing') {
    return (
      <LandingPage
        onLogin={() => setView('login')}
        onSignup={() => setView('signup')}
      />
    )
  }

  return (
    <div className="ns-page">
      {view === 'login' ? (
        <LoginForm
          onSwitchToSignup={() => setView('signup')}
          onLogoClick={() => setView('landing')}
          onLoginSuccess={() => setView('landing')}
        />
      ) : (
        <SignupForm
          onSwitchToLogin={() => setView('login')}
          onLogoClick={() => setView('landing')}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/new-password" element={<NewPassword />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/*" element={<MainFlow />} />
    </Routes>
  )
}

export default App