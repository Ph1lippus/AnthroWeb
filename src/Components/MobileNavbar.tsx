import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ClipboardList, FolderKanban, StickyNote, User } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import type { User as AuthUser } from '@supabase/supabase-js';

const MobileNavbar: React.FC = () => {
    const location = useLocation();
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const items = [
        { to: '/Daily-Log', label: 'Daily Logs', icon: ClipboardList },
        { to: '/Projects', label: 'Projects', icon: FolderKanban },
        { to: '/Notes', label: 'Notes', icon: StickyNote },
        { to: '/Profile', label: 'Profile', icon: User },
    ];

    if (!user) return null;

    const isActive = (to: string) =>
        location.pathname.toLowerCase() === to.toLowerCase() || location.pathname.toLowerCase().startsWith(to.toLowerCase() + '/');

    return (
        <nav className="mobile-navbar" aria-label="Mobile navigation">
            {items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={`mobile-navbar-link${isActive(to) ? ' active' : ''}`} aria-label={label}>
                    <Icon className="mobile-navbar-icon" size={22} strokeWidth={2} />
                    <span className="mobile-navbar-label">{label}</span>
                </NavLink>
            ))}
        </nav>
    );
};

export default MobileNavbar;
