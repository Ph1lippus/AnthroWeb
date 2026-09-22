import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, Dumbbell, NotebookPen, User } from 'lucide-react';
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
        { to: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/Workouts', label: 'Workouts', icon: Dumbbell },
        { to: '/Notes', label: 'Notes', icon: NotebookPen },
        { to: '/Profile', label: 'Profile', icon: User },
    ];

    if (!user) return null;

    const isActive = (to: string) =>
        location.pathname.toLowerCase() === to.toLowerCase() || location.pathname.toLowerCase().startsWith(to.toLowerCase() + '/');

    return (
        <nav className="mobile-navbar" aria-label="Mobile navigation">
            {items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={`mobile-navbar-link${isActive(to) ? ' active' : ''}`} aria-label={label}>
                    <Icon className="mobile-navbar-icon" size={26} strokeWidth={2} />
                </NavLink>
            ))}
        </nav>
    );
};

export default MobileNavbar;
