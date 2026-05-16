import { useState } from 'react'
import './App.css'
import Homepage from './pages/homepage'
import Header from './components/Header'
import Footer from './components/Footer'
import { Outlet, useLocation } from "react-router-dom";

function App() {
  const location = useLocation();
  const showFooter = location.pathname === "/";

  return (
    <>
      <Header />
      <div className='main'>
        <Outlet />
      </div>
      {showFooter && <Footer />}
    </>
  )
}

export default App
