import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage.jsx'
import LoginForm from './components/LoginForm.jsx'
import SignupForm from './components/SignUpForm.jsx'
import ForgotPassword from './pages/ForgotPassword'
import NewPassword from './pages/NewPassword'
import Welcome from './pages/Welcome.jsx'
<<<<<<< HEAD
import Dashboard from './pages/Dashboard.jsx'
=======
>>>>>>> 1cd65e055b767ce02be776f51f0670fb868aed67

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
      <Route path="/welcome" element={<Welcome />} />
<<<<<<< HEAD
      <Route path="/dashboard" element={<Dashboard />} />
=======
>>>>>>> 1cd65e055b767ce02be776f51f0670fb868aed67
      <Route path="/*" element={<MainFlow />} />
    </Routes>
  )
}

export default App