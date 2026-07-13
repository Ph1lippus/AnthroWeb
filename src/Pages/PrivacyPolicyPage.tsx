import React from 'react';
import Title from '../Components/Title';

const PrivacyPolicyPage: React.FC = () => {
    const sections = [
        { title: 'Introduction', content: 'AnthroWeb ("we", "us", or "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our daily tracking application.' },
        { 
            title: 'Information We Collect', 
            content: 'We collect the following types of information to provide our health and productivity tracking services:', 
            list: [
                'Account Information - Email, username, and authentication data provided during registration via Supabase Auth',
                'Daily Health Metrics - Sleep patterns (wake time, bedtime), blood pressure, heart rate, body temperature, weight, body fat percentage, nutrition (calories, protein, carbs, fat, water)',
                'Daily Activities - Mood ratings, journal entries, habit completion status',
                'Body Measurements - Weekly body composition data including waist, hips, chest, arms, legs measurements with computed values like BMI and WHtR',
                'Reading Progress - Book titles, page counts, progress tracking, personal ratings',
                'Workout Data - Exercise logs, sets, reps, weight lifted, PR history, workout templates',
                'Project Tracking - Project titles, descriptions, progress, deadlines, and completion status',
                'Academic Data - Course grades, assessments, semester information, and academic goals',
                'Study Sessions - Duration and type of study activities (integrated with Protomo study timer)'
            ]
        },
        { 
            title: 'How We Use Your Information', 
            content: 'Your data is used solely to provide and improve our services:', 
            list: [
                'To provide personalized dashboards and daily score calculations',
                'To calculate trends, correlations, and health insights',
                'To enable badge achievements and streak tracking',
                'To sync data across your devices securely',
                'To integrate with the Protomo study timer via shared Supabase backend'
            ]
        },
        { 
            title: 'Data Storage and Security', 
            content: 'All data is stored securely using Supabase with the following security measures:', 
            list: [
                'Row Level Security (RLS) policies ensure your data is only accessible to you',
                'Industry-standard encryption for data in transit and at rest',
                'Secure authentication via Supabase Auth'
            ]
        },
        {
            title: 'Data Retention and Deletion',
            content: 'You have full control over your data. You may delete your account and all associated data at any time through the Settings page or by contacting us. When you delete your account, all your data is permanently removed from our systems.'
        },
        {
            title: 'Third-Party Services',
            content: 'We integrate with a companion study-timer app (Protomo) at protomo.vercel.app. This integration is optional and uses the same Supabase backend to sync study session data between applications.'
        },
        {
            title: 'Your Rights',
            content: 'You have the right to access, modify, or delete your personal data. You may also request a copy of your data in a portable format. All these options are available through your account settings.'
        },
        {
            title: 'Contact',
            content: 'If you have questions about this Privacy Policy or your data, please contact us through our GitHub repository.',
            link: true
        }
    ];

    return (
        <>
            <Title title="Privacy Policy" />
            <div className="legal-page">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Privacy Policy</h2>
                        <span>Your privacy is important to us</span>
                    </div>
                    <div className="legal-content">
                        {sections.map((section, index) => (
                            <div className="legal-section" key={index}>
                                <h3>{section.title}</h3>
                                {section.link ? (
                                    <p>If you have questions about this Privacy Policy or your data, please contact us through our <a href="https://github.com/Ph1lippus" target="_blank" rel="noopener noreferrer" className="auth-link">GitHub repository</a>.</p>
                                ) : (
                                    <p>{section.content}</p>
                                )}
                                {section.list && (
                                    <ul>
                                        {section.list.map((item, i) => (
                                            <li key={i}><strong>{item.split(' - ')[0]}</strong> - {item.split(' - ')[1] || item}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                        <p className="legal-date">Last updated: July 2026</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PrivacyPolicyPage;