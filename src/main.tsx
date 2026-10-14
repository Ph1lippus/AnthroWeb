import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { startAuthSession } from './services/authSession'
import { NoticeProvider } from './Components/Feedback/NoticeProvider'
import { initializeQueryPersistence, setVaultOpenCheck } from './services/queryPersistence'
import { isVaultOpen, registerCacheClear } from './hooks/useAppLock'

if (Capacitor.isNativePlatform()) {
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#00000000' });
}

// Started here, before the first render, rather than from a component effect: the
// session round-trip is on the critical path to every page, and the app cannot
// paint anything until it resolves. Kicking it off at entry point means it is
// already in flight while React is still mounting.
// Safe to call more than once -- the store guards on having started.
startAuthSession();

// Server-state cache shared across pages (dashboard, daily log, history, ...).
// staleTime keeps navigation instant; refetchOnWindowFocus is off so the
// Capacitor WebView doesn't fire bursts of requests when the app regains focus.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 120_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
        },
    },
});

const bootstrap = async (): Promise<void> => {
    // Wait for the current auth session before hydrating so a previous user's
    // persisted cache can never be rendered under a different account.
    try {
        await initializeQueryPersistence(queryClient)
    } catch (error) {
        // A storage failure must not prevent the app from loading with a fresh cache.
        console.warn('Query cache persistence is unavailable', error)
    }

    // Tying the two together here rather than inside either module: the persister
    // decides whether to write, and the lock decides when. `main.tsx` is the only
    // place holding both the query client and the boot sequence.
    setVaultOpenCheck(isVaultOpen)
    registerCacheClear(() => queryClient.clear())

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                {/* Outside the router and outside the app lock, deliberately.
                    A message raised by a page that is unmounting still has to land
                    somewhere, and the one place it can land is a container that
                    outlives the page. Putting it inside either would mean a form
                    that fails during teardown reports into a tree that is on its
                    way out -- which is the React "setState on an unmounted
                    component" warning, just relocated. */}
                <NoticeProvider>
                    <App />
                </NoticeProvider>
            </QueryClientProvider>
        </StrictMode>,
    )
}

void bootstrap()