import React, { createContext, useCallback, useContext, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import LoadingBar from '../Components/LoadingBar';
import { isRoutePreloaded } from '../utils/routePreloaders';

interface LoadingBarContextValue {
    /** True while any query is fetching, any mutation is pending, or a manual
     *  load is in flight (e.g. a raw `await getXxx()` outside React Query). */
    isLoading: boolean;
    /** Increment this before a manual async load starts. */
    startLoading: () => void;
    /** Decrement after it finishes. */
    stopLoading: () => void;
}

const LoadingBarContext = createContext<LoadingBarContextValue | null>(null);

/**
 * Provides the single, app-wide loading bar.
 *
 * `LoadingBar` is rendered once here, outside the route tree, so every page
 * shares the exact same bar instead of each page rendering its own spinner.
 * Pages whose loading is driven by React Query are covered automatically by
 * `useIsFetching` / `useIsMutating`; pages with raw `await` loads call
 * `startLoading` / `stopLoading` (exposed via `useLoadingBar`) to join in.
 */
export const LoadingBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const fetching = useIsFetching();
    const mutating = useIsMutating();
    const [manual, setManual] = useState(0);
    const [routeKey, setRouteKey] = useState(location.key);
    const [routeLoading, setRouteLoading] = useState(!isRoutePreloaded(location.pathname));

    if (routeKey !== location.key) {
        setRouteKey(location.key);
        setRouteLoading(!isRoutePreloaded(location.pathname));
    }

    const isBusy = fetching > 0 || mutating > 0 || manual > 0;
    const isLoading = routeLoading || isBusy;

    React.useEffect(() => {
        if (!routeLoading) return;

        // The route overlay covers the code-split handoff only. Data queries
        // have their own page readiness gates; tying this timer to every
        // background query made a slow dashboard hide the entire application.
        const timer = window.setTimeout(() => setRouteLoading(false), 120);
        return () => window.clearTimeout(timer);
    }, [location.key, routeLoading]);

    const startLoading = useCallback(() => {
        setManual((prev) => prev + 1);
    }, []);

    const stopLoading = useCallback(() => {
        setManual((prev) => Math.max(0, prev - 1));
    }, []);

    return (
        <LoadingBarContext.Provider value={{ isLoading, startLoading, stopLoading }}>
            <LoadingBar show={isLoading} blocking={routeLoading} label={routeLoading ? 'Loading page' : 'Updating'} />
            {children}
        </LoadingBarContext.Provider>
    );
};

// This hook intentionally shares the provider's context from this module.
// eslint-disable-next-line react-refresh/only-export-components
export const useLoadingBar = (): LoadingBarContextValue => {
    const ctx = useContext(LoadingBarContext);
    if (!ctx) {
        throw new Error('useLoadingBar must be used inside a LoadingBarProvider');
    }
    return ctx;
};
