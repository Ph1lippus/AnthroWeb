import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// After index.css on purpose: the workouts screens override shared form and
// button primitives, so they need to win on equal specificity.
import './styles/workouts.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { startAuthSession } from './services/authSession'

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
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
)