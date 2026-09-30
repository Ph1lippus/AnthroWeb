import React from 'react';

interface LoadingSpinnerProps {
    /** Accessible label, e.g. "Loading workouts". Defaults to a generic one. */
    label?: string;
    /**
     * `inline` drops the block padding and shrinks the ring, for a spinner that
     * sits inside a line of text (e.g. standing in for an email address that
     * has not arrived yet) rather than filling a whole panel.
     */
    inline?: boolean;
}

/**
 * The app's single loading state.
 *
 * Deliberately just a spinner: the previous markup paired every spinner with a
 * "Loading profile..." / "Loading charts..." paragraph, which meant the same
 * message was duplicated across ~20 files and flashed text that nobody reads
 * for the fraction of a second it was on screen. The label is now only exposed
 * to screen readers through `role="status"`, so it is announced without being
 * painted.
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ label = 'Loading', inline = false }) => (
    <div
        className={inline ? 'loading-spinner-inline' : 'profile-loading'}
        role="status"
        aria-live="polite"
        aria-label={label}
    >
        <div className="profile-loading-spinner" aria-hidden="true"></div>
    </div>
);

export default LoadingSpinner;
