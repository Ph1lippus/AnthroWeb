import React from 'react';

const HomePage: React.FC = () => {
    return (
        <section className="screen-height home-page">
            <h1 className="slogan">Track. Improve. Succeed.</h1>
            <hr className="animated-hr" />
            <p style={{ color: 'var(--color-light)', marginTop: '2rem', fontSize: '1.25rem' }}>
                Your personal companion for building better habits and achieving your goals.
            </p>
        </section>
    );
};

export default HomePage;