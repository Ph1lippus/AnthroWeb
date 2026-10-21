import React from 'react';
import { Outlet } from 'react-router-dom';
import SettingsShell from './SettingsShell';

/**
 * Persistent settings frame. The rail lives here, outside the routed page, so
 * switching sections only swaps the right-hand panel instead of remounting the
 * whole shell (which made the left rail flash/move).
 */
const SettingsLayout: React.FC = () => (
    <SettingsShell>
        <Outlet />
    </SettingsShell>
);

export default SettingsLayout;