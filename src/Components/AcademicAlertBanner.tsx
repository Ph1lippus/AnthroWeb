import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAcademicAlerts } from '../hooks/useAcademicAlerts';

interface AcademicAlertBannerProps {
    /** Short form for narrow layouts, where the full sentence cannot fit. */
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
 */
const AcademicAlertBanner: React.FC<AcademicAlertBannerProps> = ({ compact = false }) => {
    const { data: alerts } = useAcademicAlerts();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);

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

    return (
        <button
            type="button"
            className={`academic-alert${alert.urgent ? ' academic-alert--urgent' : ''}`}
            onClick={() => navigate('/academic')}
            role="status"
            // Not re-keyed on the id: the message swaps in place. Remounting the
            // element would restart any entry animation, and the strip is meant
            // to be static now.
            title={alert.message}
        >
            <AlertTriangle size={13} className="academic-alert__icon" aria-hidden="true" />
            <span className="academic-alert__text">{compact ? alert.shortMessage : alert.message}</span>
            {count > 1 && (
                <span className="academic-alert__pager" aria-hidden="true">
                    {index + 1}/{count}
                </span>
            )}
        </button>
    );
};

export default AcademicAlertBanner;