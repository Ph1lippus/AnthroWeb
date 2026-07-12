import './App.css'
import Navbar from './Components/Navbar'
import SecondaryNavbar from './Components/SecondaryNavbar'
import HomePage from './Pages/HomePage'
import LoginPage from './Pages/LoginPage'
import RegisterPage from './Pages/RegisterPage'
import DashboardPage from './Pages/DashboardPage'
import BooksPage from './Pages/BooksPage'
import ProjectsPage from './Pages/ProjectsPage'
import ProfilePage from './Pages/ProfilePage'
import CreditsPage from './Pages/CreditsPage'
import Footer from './Components/Footer'
import ScrollToTop from './Components/ScrollToTop'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/dashboard" element={
          <>
            <SecondaryNavbar />
            <DashboardPage />
          </>
        } />
        <Route path="/books" element={
          <>
            <SecondaryNavbar />
            <BooksPage />
          </>
        } />
        <Route path="/projects" element={
          <>
            <SecondaryNavbar />
            <ProjectsPage />
          </>
        } />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}

export default App