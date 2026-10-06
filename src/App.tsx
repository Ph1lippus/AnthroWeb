import React, { lazy, Suspense, useDeferredValue, useEffect } from 'react';
import SidebarNav from './Components/SidebarNav'
import TipLayer from './Components/TooltipLayer'
import MobileNavbar from './Components/MobileNavbar'
import UpdateModal from './Components/UpdateModal'
import HomePage from './Pages/HomePage'
import Footer from './Components/Footer'
import ScrollToTop from './Components/ScrollToTop'
import { BrowserRouter, Routes, Route, useLocation, useSearchParams, useParams, Navigate } from 'react-router-dom'
import { LoadingBarProvider } from './hooks/useLoadingBar'
import { ConfirmModalProvider } from './hooks/useConfirmModal'
import { useBootFetchHandoff, useBootHold, dismissBootScreenImmediate } from './services/bootScreen'
import { useAuthSession } from './hooks/useAuthSession'
import { useQueryClient } from '@tanstack/react-query'
import { pageLoaders, preloadRoute } from './utils/routePreloaders'
import LoadingBar from './Components/LoadingBar'

const DashboardPage = lazy(pageLoaders['/Dashboard']);
const DailyLogPage = lazy(pageLoaders['/Daily-Log']);
const DailyLogHistoryPage = lazy(pageLoaders['/Daily-Log/History']);
const JournalPage = lazy(pageLoaders['/Journal']);
const JournalEditPage = lazy(pageLoaders['/Journal/Edit']);
const DailyLogGoalSetupPage = lazy(pageLoaders['/Daily-Log/Setup']);
const MeasurementsPage = lazy(pageLoaders['/Measurements']);
const BooksPage = lazy(pageLoaders['/Books']);
const WorkoutsPage = lazy(pageLoaders['/Workouts']);
const ProjectsPage = lazy(pageLoaders['/Projects']);
const AbstinencePage = lazy(pageLoaders['/Abstinence']);
const AcademicPage = lazy(pageLoaders['/Academic']);
const StudyTimerPage = lazy(pageLoaders['/Study-Timer']);
const NotesPage = lazy(pageLoaders['/Notes']);
const SettingsPage = lazy(pageLoaders['/Settings']);
const AppPage = lazy(pageLoaders['/Settings/App']);
const AccountPage = lazy(pageLoaders['/Settings/Account']);
const ProfilePage = lazy(pageLoaders['/Profile']);
const EditProfilePage = lazy(pageLoaders['/Profile/Edit']);
const CreditsPage = lazy(pageLoaders['/credits']);
const PrivacyPolicyPage = lazy(pageLoaders['/privacy-policy']);
const TermsOfServicePage = lazy(pageLoaders['/terms-of-service']);

const RouteLoadingFallback: React.FC = () => (
    <LoadingBar show blocking label="Loading page" />
);

/**
 * Sends a retired workout sub-page to the panel on /Workouts that replaced it.
 *
 * Workouts used to be six tabs, then two pages of templates; it is one page now,
 * with the session editor at `?day=` and a routine's week at `?template=`. This
 * exists so an old bookmark lands on the right thing instead of a 404.
 *
 * `searchParam` carries a query value across: /Workouts/Check?date=X becomes
 * /Workouts?day=X, because the page reads `day` and nothing else. `fromRoute`
 * does the same for a path segment, which is how /Workouts/Template/:id keeps
 * the template it was pointing at.
 */
const WorkoutLegacyRedirect: React.FC<{
    /** Either a full query string such as '?day=2026-01-01', or a bare param name. */
    to: string;
    searchParam?: string;
    /** Read the value from a path segment rather than the query string. */
    fromRoute?: string;
}> = ({ to, searchParam, fromRoute }) => {
    const [params] = useSearchParams();
    const routeParams = useParams();

    const value = fromRoute
        ? routeParams[fromRoute]
        : searchParam ? params.get(searchParam) : null;

    let query = '';
    if (to.startsWith('?')) {
        query = to;
    } else if (to === '/') {
        // The bare page, no query at all. Not `?/`, which would be a stray
        // parameter the page then has to learn to ignore.
        query = '';
    } else if (searchParam && value) {
        query = `?${to}=${encodeURIComponent(value)}`;
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
    const isGuest = resolved && !user;
    // Re-run the whole gate when the user changes: after login the splash is
    // back up (see showBootTransition) but this effect's fetch loop finished
    // long ago, so without a re-run nothing would take it back down.

    // Guests never see the splash: without a session there is nothing to wait
    // for, so take down whatever the inline script in index.html left behind.

    useEffect(() => {
        if (isGuest) dismissBootScreenImmediate();
    }, [isGuest]);

    // An authenticated visit to `/` is only an intermediate route: React
    // renders <Navigate> first and mounts the Daily Log on the next commit.
    // Keep the splash locked across that redirect so the handoff can never
    // complete during the quiet frame between the two route renders.
    useBootHold(resolved && !!user && location.pathname === '/');
    useBootFetchHandoff(user?.id);
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
    const queryClient = useQueryClient();
    const location = useLocation();
    // Keep the currently rendered route visible while a newly selected lazy
    // route is being fetched. Rendering the new location immediately makes the
    // Suspense fallback replace a perfectly usable page with a blank loader.
    const deferredLocation = useDeferredValue(location);

    useEffect(() => {
        if (!resolved) return;
        const likelyNextRoutes: Record<string, string[]> = {
            '/Daily-Log': ['/Dashboard', '/Measurements', '/Workouts'],
            '/Dashboard': ['/Daily-Log', '/Measurements', '/Notes'],
            '/Measurements': ['/Dashboard', '/Daily-Log', '/Workouts'],
            '/Workouts': ['/Daily-Log', '/Dashboard', '/Measurements'],
            '/Notes': ['/Daily-Log', '/Dashboard', '/Profile'],
        };
        const routes = likelyNextRoutes[location.pathname] ?? ['/Daily-Log', '/Dashboard'];
        const requestIdle = window.requestIdleCallback;
        if (typeof requestIdle === 'function') {
            const idle = requestIdle(
                () => routes.forEach(path => preloadRoute(path, queryClient)),
                { timeout: 1500 },
            );
            return () => window.cancelIdleCallback(idle);
        }
        const timer = window.setTimeout(() => routes.forEach(path => preloadRoute(path, queryClient)), 250);
        return () => window.clearTimeout(timer);
    }, [location.pathname, queryClient, resolved]);

    if (!resolved) return null;

    return (
        <>
            <SidebarNav />
            <MobileNavbar />
            {/* Mounted once, here, because it works by delegation: any element
                anywhere carrying `data-tip` is found from the document rather
                than registered with it. Rendering it inside a route would mean
                re-mounting it on every navigation, which drops a tip that was
                up as the page changes underneath it. */}
            <TipLayer />
            <UpdateModal />
            <Suspense fallback={<RouteLoadingFallback />}>
            <Routes location={deferredLocation}>
                <Route path="/" element={<DefaultRoute />} />
                {/* Auth lives in the home card now: login and reset swap inside
                    one container, so these retired pages redirect home instead
                    of 404ing old bookmarks. */}
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/" replace />} />
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
                {/* Workouts is one page. These used to be pages of their own; their
                    routes now carry a query value across so an old bookmark, a
                    notification or the daily log's own links land on the right
                    panel instead of a 404. */}
                <Route
                    path="/Workouts/Templates"
                    element={<WorkoutLegacyRedirect to="/" />}
                />
                <Route
                    path="/Workouts/Template/:id"
                    element={<WorkoutLegacyRedirect to="template" searchParam="id" fromRoute="id" />}
                />
                {/* Workouts used to be six tabs. They are one page now, with the
                    session editor reached through a query parameter. These
                    redirects carry old links and bookmarks onto the right panel of
                    that page rather than 404ing, and `replace` keeps the Back button
                    going where the user actually came from instead of bouncing them
                    forward into the redirect again. */}
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
                <Route path="/Workouts/PRs" element={<WorkoutLegacyRedirect to="/" />} />
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
            </Suspense>
            <AuthenticatedFooter />
            <BootHandoff />
        </>
    );
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <LoadingBarProvider>
        <ConfirmModalProvider>
          <AuthenticatedApp />
        </ConfirmModalProvider>
      </LoadingBarProvider>
    </BrowserRouter>
  )
}

export default App