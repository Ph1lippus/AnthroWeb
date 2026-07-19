import Navbar from './Components/Navbar'
import SecondaryNavbar from './Components/SecondaryNavbar'
import HomePage from './Pages/HomePage'
import LoginPage from './Pages/LoginPage'
import RegisterPage from './Pages/RegisterPage'
import DashboardPage from './Pages/DashboardPage'
import DailyLogPage from './Pages/DailyLogPage'
import MeasurementsPage from './Pages/MeasurementsPage'
import BooksPage from './Pages/BooksPage'
import WorkoutsPage from './Pages/WorkoutsPage'
import ProjectsPage from './Pages/ProjectsPage'
import AcademicPage from './Pages/AcademicPage'
import StudyTimerPage from './Pages/StudyTimerPage'
import SettingsPage from './Pages/SettingsPage'
import ProfilePage from './Pages/ProfilePage'
import EditProfilePage from './Pages/EditProfilePage'
import CreditsPage from './Pages/CreditsPage'
import PrivacyPolicyPage from './Pages/PrivacyPolicyPage'
import TermsOfServicePage from './Pages/TermsOfServicePage'
import ForgotPasswordPage from './Pages/ForgotPasswordPage'
import Footer from './Components/Footer'
import ScrollToTop from './Components/ScrollToTop'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './services/supabaseClient'
import type { User } from '@supabase/supabase-js'

const AuthenticatedFooter: React.FC = () => {
    const location = useLocation();
    const [user, setUser] = useState<User | null>(null);
    
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);
    
    // Don't show footer on authenticated pages (where secondary navbar appears)
    const authPaths = ['/dashboard', '/daily-log', '/measurements', '/books', '/workouts', '/projects', '/academic', '/study-timer', '/settings', '/profile', '/profile/edit'];
    if (user && authPaths.includes(location.pathname)) {
        return null;
    }
    
    return <Footer loggedIn={!!user} />;
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Navbar />
      <SecondaryNavbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/daily-log" element={<DailyLogPage />} />
        <Route path="/measurements" element={<MeasurementsPage />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/academic" element={<AcademicPage />} />
        <Route path="/study-timer" element={<StudyTimerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
      </Routes>
      <AuthenticatedFooter />
    </BrowserRouter>
  )
}

export default App