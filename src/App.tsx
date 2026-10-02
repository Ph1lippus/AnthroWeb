import Navbar from './Components/Navbar'
import SidebarNav from './Components/SidebarNav'
import MobileNavbar from './Components/MobileNavbar'
import UpdateModal from './Components/UpdateModal'
import HomePage from './Pages/HomePage'
import LoginPage from './Pages/LoginPage'
import RegisterPage from './Pages/RegisterPage'
import DashboardPage from './Pages/DashboardPage'
import DailyLogPage from './Pages/DailyLogPage'
import DailyLogHistoryPage from './Pages/DailyLogHistoryPage'
import JournalPage from './Pages/JournalPage'
import JournalEditPage from './Pages/JournalEditPage'
import DailyLogGoalSetupPage from './Pages/DailyLogGoalSetupPage'
import MeasurementsPage from './Pages/MeasurementsPage'
import BooksPage from './Pages/BooksPage'
import WorkoutsPage from './Pages/WorkoutsPage'
import WorkoutCheckPage from './Pages/WorkoutCheckPage'
import WorkoutTemplatesPage from './Pages/WorkoutTemplatesPage'
import WorkoutTemplateEditorPage from './Pages/WorkoutTemplateEditorPage'
import WorkoutHistoryPage from './Pages/WorkoutHistoryPage'
import WorkoutPRsPage from './Pages/WorkoutPRsPage'
import WorkoutDashboardPage from './Pages/WorkoutDashboardPage'
import ProjectsPage from './Pages/ProjectsPage'
import AbstinencePage from './Pages/AbstinencePage'
import AcademicPage from './Pages/AcademicPage'
import StudyTimerPage from './Pages/StudyTimerPage'
import NotesPage from './Pages/NotesPage'
import SettingsPage from './Pages/SettingsPage'
import AppPage from './Pages/AppPage'
import AccountPage from './Pages/AccountPage'
import ProfilePage from './Pages/ProfilePage'
import EditProfilePage from './Pages/EditProfilePage'
import CreditsPage from './Pages/CreditsPage'
import PrivacyPolicyPage from './Pages/PrivacyPolicyPage'
import TermsOfServicePage from './Pages/TermsOfServicePage'
import ForgotPasswordPage from './Pages/ForgotPasswordPage'
import Footer from './Components/Footer'
import ScrollToTop from './Components/ScrollToTop'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { BOOT_DEFAULT_DELAY_MS, dismissBootScreen } from './services/bootScreen'
import { useAuthSession } from './hooks/useAuthSession'
import { useEffect } from 'react'

const AuthenticatedFooter: React.FC = () => {
    const location = useLocation();
    const { user } = useAuthSession();

    // Only show footer on the home page
    if (location.pathname !== '/') {
        return null;
    }

    return <Footer loggedIn={!!user} />;
};

// Send signed-in users straight to their Daily Log; guests get the landing page.
const DefaultRoute: React.FC = () => {
    const { user, resolved } = useAuthSession();

    // Only called once the session is known, so this never renders a landing page
    // to somebody who is about to be redirected to their Daily Log.
    if (!resolved) return null;
    if (user) return <Navigate to="/Daily-Log" replace />;
    return <HomePage />;
};

/**
 * The app, held back until the session is known.
 *
 * Everything below -- navbars, sidebar, routes, footer -- stays unmounted until
 * `resolved` flips, so a signed-in user is never shown the landing page with the
 * footer under it on the way to their Daily Log. That was the visible glitch on
 * open: the route guard used to return null until its own `getSession()` settled,
 * which left the footer free to paint against an otherwise empty screen.
 */
const AuthenticatedApp: React.FC = () => {
    const { resolved } = useAuthSession();

    useEffect(() => {
        // Deliberately not an immediate dismissal. Knowing the session is not the
        // same as having a page to show: the dashboard renders nothing until its
        // code-split chart chunk and its queries are in hand, and several other
        // routes gate on their own data. Taking the splash down here is what made
        // boot read as two paints and a jump -- black screen, empty page, then
        // content arriving underneath it.
        //
        // This is the default handover, one frame after the shell mounts, for the
        // routes that have their content synchronously. A route that has to wait
        // calls `useBootDismiss(ready)` with its own gate and wins the race,
        // because `dismissBootScreen` is idempotent and first-call-wins.
        if (!resolved) return;
        const timer = window.setTimeout(dismissBootScreen, BOOT_DEFAULT_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [resolved]);

    if (!resolved) return null;

    return (
        <>
            <Navbar />
            <SidebarNav />
            <MobileNavbar />
            <UpdateModal />
            <Routes>
                <Route path="/" element={<DefaultRoute />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                <Route path="/Dashboard" element={<DashboardPage />} />
                <Route path="/Daily-Log/Setup" element={<DailyLogGoalSetupPage />} />
                <Route path="/Daily-Log" element={<DailyLogPage />} />
                <Route path="/Daily-Log/Edit/:id" element={<DailyLogPage />} />
                <Route path="/Daily-Log/History" element={<DailyLogHistoryPage />} />
                <Route path="/Journal" element={<JournalPage />} />
                <Route path="/Journal/Edit/:id" element={<JournalEditPage />} />
                <Route path="/Measurements" element={<MeasurementsPage />} />
                <Route path="/Books" element={<BooksPage />} />
                <Route path="/Workouts" element={<WorkoutsPage />} />
                <Route path="/Workouts/Dashboard" element={<WorkoutDashboardPage />} />
                <Route path="/Workouts/Templates" element={<WorkoutTemplatesPage />} />
                <Route path="/Workouts/Template/:id" element={<WorkoutTemplateEditorPage />} />
                <Route path="/Workouts/Check" element={<WorkoutCheckPage />} />
                <Route path="/Workouts/History" element={<WorkoutHistoryPage />} />
                <Route path="/Workouts/PRs" element={<WorkoutPRsPage />} />
                <Route path="/Projects" element={<ProjectsPage />} />
                <Route path="/Abstinence" element={<AbstinencePage />} />
                <Route path="/Academic" element={<AcademicPage />} />
                <Route path="/Study-Timer" element={<StudyTimerPage />} />
                <Route path="/Notes" element={<NotesPage />} />
                {/* Same workspace, a different page open. The route parameter selects it,
                    which keeps notes deep-linkable and gives Back a step to return to. */}
                <Route path="/Notes/:id" element={<NotesPage />} />
                <Route path="/Settings" element={<SettingsPage />} />
                <Route path="/Settings/App" element={<AppPage />} />
                <Route path="/Settings/Account" element={<AccountPage />} />
                <Route path="/Profile" element={<ProfilePage />} />
                <Route path="/Profile/Edit" element={<EditProfilePage />} />
                <Route path="*" element={<DefaultRoute />} />
            </Routes>
            <AuthenticatedFooter />
        </>
    );
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthenticatedApp />
    </BrowserRouter>
  )
}

export default App