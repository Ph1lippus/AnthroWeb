import React from 'react';
import LoadingBar from './LoadingBar';

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
 * Kept as a compatibility component for pages that still have a local loading
 * branch. Route loading is owned by LoadingBarProvider, so no page renders a
 * second spinner or reserves a competing loading layout.
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = () => (
    <LoadingBar show blocking label="Loading page" />
);

export default LoadingSpinner;
