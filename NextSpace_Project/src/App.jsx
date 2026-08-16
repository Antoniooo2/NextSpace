import { useState } from 'react'
import LandingPage from './components/LandingPage.jsx'
import LoginForm from './components/LoginForm.jsx'
import SignupForm from './components/SignUpForm.jsx'

function App() {
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

export default App
