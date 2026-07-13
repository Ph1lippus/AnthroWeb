import React from 'react';
import Title from '../Components/Title';

const AcademicPage: React.FC = () => {
    return (
        <>
            <Title title="Academic" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Academic</h2>
                        <span>Track your academic progress and goals</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AcademicPage;