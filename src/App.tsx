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
import NotesPage from './Pages/NotesPage'
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
    const authPaths = ['/Dashboard', '/Daily-Log', '/Measurements', '/Books', '/Workouts', '/Projects', '/Academic', '/Study-Timer', '/Notes', '/Settings', '/Profile', '/Profile/Edit'];
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
        <Route path="/Dashboard" element={<DashboardPage />} />
        <Route path="/Daily-Log" element={<DailyLogPage />} />
        <Route path="/Measurements" element={<MeasurementsPage />} />
        <Route path="/Books" element={<BooksPage />} />
        <Route path="/Workouts" element={<WorkoutsPage />} />
        <Route path="/Projects" element={<ProjectsPage />} />
        <Route path="/Academic" element={<AcademicPage />} />
        <Route path="/Study-Timer" element={<StudyTimerPage />} />
        <Route path="/Notes" element={<NotesPage />} />
        <Route path="/Settings" element={<SettingsPage />} />
        <Route path="/Profile" element={<ProfilePage />} />
        <Route path="/Profile/Edit" element={<EditProfilePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <AuthenticatedFooter />
    </BrowserRouter>
  )
}

export default App