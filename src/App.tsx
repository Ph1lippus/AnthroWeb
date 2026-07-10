import './App.css'
import Navbar from './Components/Navbar'
import HomePage from './Pages/HomePage'
import Footer from './Components/Footer'
import { BrowserRouter } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <div className="galaxy-bg">
        <div className="stars"></div>
        <div className="glow-overlay"></div>
      </div>
      <Navbar />
      <HomePage />
      <Footer />
    </BrowserRouter>
  )
}

export default App