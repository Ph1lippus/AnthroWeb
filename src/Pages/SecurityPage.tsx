import React from 'react';
import Title from '../Components/Title';
import SecuritySettings from '../Components/Security/SecuritySettings';

/**
 * Settings -> Security. A route of its own rather than another row on the
 * settings list, because it is the one screen where the user needs room to read
 * what they are agreeing to -- the recovery phrase, and what is and is not
 * recoverable if the PIN is lost.
 */
const SecurityPage: React.FC = () => (
    <>
        <Title title="Security" />
        <div className="page-main-with-secondary">
            <SecuritySettings />
        </div>
    </>
);

export default SecurityPage;