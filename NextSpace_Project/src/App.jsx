import { useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import ForgotPassword from './pages/ForgotPassword'
import NewPassword from './pages/NewPassword'
import './App.css'

function Home() {
  const [count, setCount] = useState(0)
  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.jsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>

        {/* TEMP: solo para pruebas, quitar cuando el Sign In real esté conectado */}
        <div style={{ marginTop: '20px' }}>
          <Link to="/forgot-password">Go to Forgot Password (test)</Link>
          <br />
          <Link to="/new-password">Go to New Password (test)</Link>
        </div>
      </section>
      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/new-password" element={<NewPassword />} />
    </Routes>
  )
}

export default App