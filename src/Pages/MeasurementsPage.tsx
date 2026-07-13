import React from 'react';
import Title from '../Components/Title';

const MeasurementsPage: React.FC = () => {
    return (
        <>
            <Title title="Measurements" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Measurements</h2>
                        <span>Track your body measurements and progress</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MeasurementsPage;