import React from 'react';
import Title from '../Components/Title';
import SettingsShell from '../Components/Settings/SettingsShell';
import SecuritySettings from '../Components/Security/SecuritySettings';

/**
 * Settings -> Security.
 *
 * Inside the settings shell rather than beside it, because this is the screen
 * where the user needs room to read what they are agreeing to -- the recovery
 * phrase, and what is and is not recoverable if a PIN is lost. The rail beside it
 * costs 272px and is worth it for that.
 */
const SecurityPage: React.FC = () => (
    <>
        <Title title="Security" />
        <SettingsShell title="Security">
            <SecuritySettings />
        </SettingsShell>
    </>
);

export default SecurityPage;