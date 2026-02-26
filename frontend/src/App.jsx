import { useState } from 'react'
import './App.css'
import Homepage from './pages/homepage'
import Header from './components/Header'
import Footer from './components/Footer'
import { Outlet } from "react-router-dom";

function App() {

  return (
    <>
      <Header />
      <div className='main'>
        <Outlet />
      </div>
      <Footer />
    </>
  )
}

export default App
