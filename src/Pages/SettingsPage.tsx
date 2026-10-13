import React from 'react';
import { NavLink } from 'react-router-dom';
import Title from '../Components/Title';
import SettingsShell from '../Components/Settings/SettingsShell';

/**
 * Settings overview.
 *
 * A card grid rather than the old full-width rows. The rows were sized for a
 * 600px column; in a panel that already has a rail beside it they read as a
 * second navigation list rather than as content, which is the wrong thing for
 * the page whose job is to be a landing spot.
 */
const SettingsPage: React.FC = () => (
    <>
        <Title title="Settings" />
        <SettingsShell>
            <p className="settings-card-desc">
                Pick a section on the left. Anything you change here takes effect
                immediately and is stored on your account, so it follows you to the
                Android app.
            </p>

            <div className="settings-cards">
                <NavLink to="/Settings/Security" className="settings-card">
                    <div className="settings-card-head">
                        <span className="settings-card-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </span>
                        <span className="settings-card-title">Security</span>
                    </div>
                    <p className="settings-card-desc">
                        Lock the whole app on launch, encrypt your data, and set up page
                        recovery so a forgotten page PIN is not the end of that page.
                    </p>
                </NavLink>

                <NavLink to="/Profile/Edit" className="settings-card">
                    <div className="settings-card-head">
                        <span className="settings-card-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </span>
                        <span className="settings-card-title">Profile</span>
                    </div>
                    <p className="settings-card-desc">
                        Your name, avatar, and the details attached to your account.
                    </p>
                </NavLink>

                <NavLink to="/Settings/App" className="settings-card">
                    <div className="settings-card-head">
                        <span className="settings-card-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <rect x="5" y="2" width="14" height="20" rx="2" />
                                <path d="M12 18h.01" />
                            </svg>
                        </span>
                        <span className="settings-card-title">App</span>
                    </div>
                    <p className="settings-card-desc">
                        Version, in-app updates, and installing AnthroWeb on this device.
                    </p>
                </NavLink>

                <NavLink to="/Settings/Account" className="settings-card">
                    <div className="settings-card-head">
                        <span className="settings-card-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <path d="M16 17l5-5-5-5" />
                                <path d="M21 12H9" />
                            </svg>
                        </span>
                        <span className="settings-card-title">Account</span>
                    </div>
                    <p className="settings-card-desc">
                        Your email address, and signing out of this device.
                    </p>
                </NavLink>
            </div>
        </SettingsShell>
    </>
);

export default SettingsPage;