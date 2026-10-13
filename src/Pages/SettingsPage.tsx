import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * `/Settings` no longer has a page of its own.
 *
 * The overview listed the sections rather than being one, and with it gone the
 * rail has nothing to point at here -- which would leave a URL that renders the
 * shell with an empty right-hand side and no active tab. Redirecting to the first
 * real section is what keeps "the rail always shows where you are" true.
 *
 * The old overview was also the only thing that made Profile, Daily log goals and
 * Measurements look reachable from settings. They are still linked from the
 * sidebar and from their own pages; they left the rail because each is a
 * full-width page, and a tab that navigates you out of the frame is not a tab.
 */
const SettingsPage: React.FC = () => <Navigate to="/Settings/Security" replace />;

export default SettingsPage;