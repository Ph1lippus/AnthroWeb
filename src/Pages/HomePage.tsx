import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
    const homeWrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const wrapper = homeWrapperRef.current;
        if (!wrapper) return;

        let scrollTimeout: number | null = null;

        const handleScroll = () => {
            if (scrollTimeout) {
                window.clearTimeout(scrollTimeout);
            }
            
            scrollTimeout = window.setTimeout(() => {
                snapToNearestSection();
            }, 150); // Wait 150ms after scroll ends before snapping
        };

        const snapToNearestSection = () => {
            if (!wrapper) return;
            
            const sections = wrapper.querySelectorAll('.screen-height');
            const scrollTop = wrapper.scrollTop;
            const wrapperHeight = wrapper.clientHeight;
            
            let closestSection: Element | null = null;
            let closestDistance = Infinity;
            
            sections.forEach((section) => {
                const sectionTop = (section as HTMLElement).offsetTop;
                const sectionCenter = sectionTop + wrapperHeight / 2;
                const currentCenter = scrollTop + wrapperHeight / 2;
                const distance = Math.abs(sectionCenter - currentCenter);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSection = section;
                }
            });
            
            if (closestSection && closestDistance > 50) {
                // Only snap if we're not already close to a section
                const targetTop = (closestSection as HTMLElement).offsetTop;
                wrapper.scrollTo({
                    top: targetTop,
                    behavior: 'smooth'
                });
            }
        };

        wrapper.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            wrapper.removeEventListener('scroll', handleScroll);
            if (scrollTimeout) {
                window.clearTimeout(scrollTimeout);
            }
        };
    }, []);

    return (
        <div className="home-wrapper" ref={homeWrapperRef}>
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
    );
};

export default HomePage;