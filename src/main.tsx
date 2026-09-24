import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

if (Capacitor.isNativePlatform()) {
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#00000000' });
}

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