import React from 'react';
import { Link } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import Title from '../Components/Title';

// The companion study-timer app that used to live on a separate host is gone,
// so this is now a self-contained page in the same shape as the other
// "not built yet" screens: a short explanation plus a way back into the app.
const StudyTimerPage: React.FC = () => {
    return (
        <>
            <Title title="Study Timer" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section study-timer-page">
                    <div className="study-timer-icon" aria-hidden="true"><Hourglass /></div>
                    <h2 className="showcase-title study-timer-title">Study Timer</h2>
                    <hr className="animated-hr" />
                    <p className="showcase-text">
                        The standalone study timer is being rebuilt inside AnthroWeb. It
                        will sync completed sessions straight into your academic log, so
                        there will be nothing left to open in a second app.
                    </p>
                    <Link to="/Academic" className="btn btn-primary showcase-btn auth-card-btn">
                        Go to Academic
                    </Link>
                </div>
            </div>
        </>
    );
};

export default StudyTimerPage;