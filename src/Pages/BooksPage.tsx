import React from 'react';
import Title from '../Components/Title';

const BooksPage: React.FC = () => {
    return (
        <>
            <Title title="Books" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Books</h2>
                        <span>Track your reading progress</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default BooksPage;