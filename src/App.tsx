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
import WorkoutTemplatesPage from './Pages/WorkoutTemplatesPage'
import WorkoutTemplateEditorPage from './Pages/WorkoutTemplateEditorPage'
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
import { BrowserRouter, Routes, Route, useLocation, useSearchParams, Navigate } from 'react-router-dom'
import { useBootFetchHandoff, useBootHold } from './services/bootScreen'
import { useAuthSession } from './hooks/useAuthSession'

/**
 * Sends a retired workout sub-page to the panel on /Workouts that replaced it.
 *
 * Workouts used to be six tabs; it is one page now, with the session editor at
 * `?day=` and the records grid at `?view=records`. This exists so an old
 * bookmark -- or the daily log's own Gym link, which still points at
 * /Workouts/Check -- lands on the right thing instead of a 404.
 *
 * `searchParam` carries a query value across: /Workouts/Check?date=X becomes
 * /Workouts?day=X, because the page reads `day` and nothing else.
 */
const WorkoutLegacyRedirect: React.FC<{
    /** Either a full query string such as '?view=records', or a bare param name. */
    to: string;
    searchParam?: string;
}> = ({ to, searchParam }) => {
    const [params] = useSearchParams();

    let query = '';
    if (to.startsWith('?')) {
        query = to;
    } else if (searchParam) {
        const value = params.get(searchParam);
        if (value) query = `?${to}=${encodeURIComponent(value)}`;
    } else if (to) {
        query = `?${to}`;
    }

    return <Navigate to={`/Workouts${query}`} replace />;
};

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
 * Decides when the boot splash comes down. Renders nothing.
 *
 * This is the whole boot handover in one place, and it used to be three separate
 * things that each guessed at the same question: is there a page on screen yet?
 *
 * The splash was taken down when the auth session resolved. That is earlier than
 * the answer, by a wide margin and by an amount that varies per route. A signed-in
 * user lands on `/`, which redirects to the Daily Log, which renders a spinner
 * until its settings arrive -- so the transition was the splash, then a second
 * full-screen black page with a spinner on it, then the actual page. Three beats
 * and two jumps, which is what it looks like when the app has briefly put two
 * boot screens on screen at once. The dashboard was worse in a different way: it
 * renders `null` rather than a spinner while it loads, so there was nothing at
 * all between the splash and the charts.
 *
 * Waiting on "nothing is fetching" fixes both at once and fixes them for every
 * route, rather than for whichever two somebody remembered to signal by hand.
 * Pages with a gate React Query cannot see -- the dashboard's code-split chart
 * chunk -- register a hold of their own; both have to be satisfied.
 */
const BootHandoff: React.FC = () => {
    const location = useLocation();
    const { resolved, user } = useAuthSession();

    // An authenticated visit to `/` is only an intermediate route: React
    // renders <Navigate> first and mounts the Daily Log on the next commit.
    // Keep the splash locked across that redirect so the handoff can never
    // complete during the quiet frame between the two route renders.
    useBootHold(resolved && !!user && location.pathname === '/');
    useBootFetchHandoff();
    return null;
};

/**
 * The app, held back until the session is known.
 *
 * Everything below -- navbars, sidebar, routes, footer -- stays unmounted until
 * `resolved` flips, so a signed-in user is never shown the landing page with the
 * footer under it on the way to their Daily Log. That was the visible glitch on
 * open: the route guard used to return null until its own `getSession()` settled,
 * which left the footer free to paint against an otherwise empty screen.
 *
 * It renders nothing at all until then, which is why the splash has to stay up:
 * there is genuinely nothing here to reveal, and it is `BootHandoff` -- rendered
 * below, so it mounts with the shell -- that decides when there finally is.
 */
const AuthenticatedApp: React.FC = () => {
    const { resolved } = useAuthSession();

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
                <Route path="/Workouts/Templates" element={<WorkoutTemplatesPage />} />
                <Route path="/Workouts/Template/:id" element={<WorkoutTemplateEditorPage />} />
                {/* Workouts used to be six tabs. They are one page now, with the
                    session editor and the records grid reached through query
                    parameters. These redirects carry old links and bookmarks onto
                    the right panel of that page rather than 404ing, and `replace`
                    keeps the Back button going where the user actually came from
                    instead of bouncing them forward into the redirect again. */}
                <Route
                    path="/Workouts/Check"
                    element={<WorkoutLegacyRedirect to="day" searchParam="date" />}
                />
                <Route
                    path="/Workouts/History"
                    element={<WorkoutLegacyRedirect to="/" />}
                />
                <Route
                    path="/Workouts/Dashboard"
                    element={<WorkoutLegacyRedirect to="/" />}
                />
                <Route
                    path="/Workouts/PRs"
                    element={<WorkoutLegacyRedirect to="?view=records" />}
                />
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
            <BootHandoff />
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