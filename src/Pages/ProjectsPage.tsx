import React from 'react';
import Title from '../Components/Title';

const ProjectsPage: React.FC = () => {
    return (
        <>
            <Title title="Projects" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Projects</h2>
                        <span>Manage your projects and goals</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProjectsPage;