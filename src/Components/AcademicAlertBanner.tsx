import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAcademicAlerts } from '../hooks/useAcademicAlerts';
import { useIsMobile } from '../hooks/useMediaQuery';

interface AcademicAlertBannerProps {
    /**
     * Short form for narrow layouts, where the full sentence cannot fit.
     *
     * Left unset by the navbar on purpose: the viewport decides, not the caller,
     * so the strip cannot end up shipping the long sentence on a phone because a
     * call site forgot a prop.
     */
    compact?: boolean;
}

/** How long each cluster stays before the next one slides in. */
const ROTATE_MS = 9000;

/**
 * A standing reminder of what is coming, in the navbar rather than on the page,
 * because the thing it is about is easiest to forget precisely when the page is
 * not open.
 *
 * Messages are shown as a cluster rather than one per deadline: three tests
 * inside a fortnight is one week of pressure, and interrupting three separate
 * times for it would be nagging rather than informing.
 *
 * The strip has a fixed height at every viewport. It rotates through its
 * messages every 9 seconds, and because it lives in the top bar on every page of
 * the app, a strip that resized as the text changed would nudge the rest of the
 * bar sideways every rotation. Only the text is ever meant to change.
 */
const AcademicAlertBanner: React.FC<AcademicAlertBannerProps> = ({ compact }) => {
    const { data: alerts } = useAcademicAlerts();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const isMobile = useIsMobile();

    const list = alerts ?? [];
    const count = list.length;

    useEffect(() => {
        if (count <= 1) return;
        const timer = setInterval(() => setStep(current => current + 1), ROTATE_MS);
        return () => clearInterval(timer);
    }, [count]);

    if (count === 0) return null;

    // Derived rather than stored: marking an item done shrinks the list, and a
    // saved index would then point past the end. Cycling the step through the
    // live length keeps the position valid with no reset effect.
    const index = step % count;
    const alert = list[index];
    // On a phone the full sentence cannot fit and gets truncated to a few
    // unreadable characters, so the short form is what ships there. The caller
    // can still force it, which is how the desktop long form is asserted.
    const useShort = compact ?? isMobile;

    return (
        <button
            type="button"
            className={`academic-alert${alert.urgent ? ' academic-alert--urgent' : ''}${
                useShort ? ' academic-alert--compact' : ''
            }`}
            onClick={() => navigate('/academic')}
            role="status"
            // Not re-keyed on the id: the message swaps in place. Remounting the
            // element would restart any entry animation, and the strip is meant
            // to be static now.
            title={alert.message}
        >
            <AlertTriangle className="academic-alert__icon" aria-hidden="true" />
            <span className="academic-alert__text">{useShort ? alert.shortMessage : alert.message}</span>
            {count > 1 && (
                <span className="academic-alert__pager" aria-hidden="true">
                    {index + 1}/{count}
                </span>
            )}
        </button>
    );
};

export default AcademicAlertBanner;