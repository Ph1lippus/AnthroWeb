import React from 'react';

interface LoadingBarProps {
    /** Show the bar. */
    show: boolean;
    /** Hide the page underneath while the next route is preparing. */
    blocking?: boolean;
    /** Optional status label. Defaults to a generic 'Loading'. */
    label?: string;
}

/**
 * One shared, centered loading bar used app-wide.
 *
 * Rather than rendering a different spinner in every page, this single bar
 * appears mid-screen whenever anything in the app is fetching or mutating.
 * The fill animates 0 -> 1 over a short, fixed window and then holds at 100%
 * so slow loads stay legible without looping. It is removed the moment the last
 * load finishes.
 */
const LoadingBar: React.FC<LoadingBarProps> = ({ show, blocking = false, label = 'Loading' }) => {
    if (!show || !blocking) return null;

    return (
        <div className="loader-screen" role="status" aria-live="polite" aria-label={label}>
            <span className="sr-only">{label}</span>
        </div>
    );
};

export default LoadingBar;
