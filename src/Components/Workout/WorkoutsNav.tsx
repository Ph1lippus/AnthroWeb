import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dumbbell, ClipboardCheck, Layers, History, Trophy, LayoutDashboard } from 'lucide-react';

const WorkoutsNav: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const items = [
        { to: '/Workouts', label: 'Today', icon: <Dumbbell className="mr-1" /> },
        { to: '/Workouts/Check', label: 'Log Workout', icon: <ClipboardCheck className="mr-1" /> },
        { to: '/Workouts/Templates', label: 'Templates', icon: <Layers className="mr-1" /> },
        { to: '/Workouts/Dashboard', label: 'Dashboard', icon: <LayoutDashboard className="mr-1" /> },
        { to: '/Workouts/History', label: 'History', icon: <History className="mr-1" /> },
        { to: '/Workouts/PRs', label: 'PRs', icon: <Trophy className="mr-1" /> },
    ];

    return (
        <div className="workout-top-bar">
            <div className="flex gap-2 flex-wrap">
                {items.map(item => (
                    <button
                        key={item.to}
                        onClick={() => navigate(item.to)}
                        className={`btn-action ${location.pathname === item.to ? 'btn-action--active' : ''}`}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default WorkoutsNav;