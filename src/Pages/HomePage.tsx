import React from 'react';
import { Link } from 'react-router-dom';
import Title from '../Components/Title';

const HomePage: React.FC = () => {
    return (
        <>
            <Title title="Home" />
            <div className="home-wrapper">
                <section className="screen-height home-page">
                    <h1 className="slogan">Track. Improve. Succeed.</h1>
                    <hr className="animated-hr" />
                    <p className="home-description">
                        Your personal companion for building better habits and achieving your goals.
                    </p>
                </section>

                <section className="screen-height showcase-section">
                    <div className="showcase-content">
                        <h2 className="showcase-title">Daily Tracking, Simplified</h2>
                        <hr className="animated-hr" />
                        <p className="showcase-text">
                            Log sleep, vitals, nutrition, workouts and habits in seconds. AnthroWeb
                            computes a weighted daily score from every metric so you always know
                            exactly how your day measures up.
                        </p>
                    </div>
                </section>

                <section className="screen-height showcase-section">
                    <div className="showcase-content">
                        <h2 className="showcase-title">Insights & Gamification</h2>
                        <hr className="animated-hr" />
                        <p className="showcase-text">
                            Set per-metric goals, earn badges for streaks, and explore correlation
                            charts that reveal how your sleep shapes tomorrow's performance. Your
                            progress, visualized.
                        </p>
                    </div>
                </section>

                <section className="screen-height showcase-section showcase-cta">
                    <div className="showcase-content">
                        <h2 className="showcase-title">Ready to Begin?</h2>
                        <hr className="animated-hr" />
                        <p className="showcase-text">
                            Join AnthroWeb today and start building the habits that move the needle.
                        </p>
                        <Link to="/register" className="btn btn-primary showcase-btn auth-card-btn">
                            Get Started
                        </Link>
                    </div>
                </section>
            </div>
        </>
    );
};

export default HomePage;