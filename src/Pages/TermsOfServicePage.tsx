import React from 'react';
import Title from '../Components/Title';

const TermsOfServicePage: React.FC = () => {
    const sections = [
        { 
            title: 'Agreement to Terms', 
            content: 'By accessing or using AnthroWeb (the "Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, you may not access or use the Service.' 
        },
        { 
            title: 'Description of Service', 
            content: 'AnthroWeb is a comprehensive daily tracking application designed to help you monitor and analyze your:', 
            list: [
                'Daily Health - Sleep, vitals, nutrition, and body measurements',
                'Habits - Daily routine tracking and streak monitoring',
                'Reading Progress - Book tracking with page and progress monitoring',
                'Workouts - Exercise logging and performance tracking',
                'Projects - Personal project management and progress',
                'Academic Performance - Grade tracking and educational goals'
            ]
        },
        { 
            title: 'User Responsibilities', 
            content: 'You agree to:', 
            list: [
                'Provide accurate information during registration and profile setup',
                'Maintain the security of your account credentials',
                'Use the service only for personal, non-commercial purposes',
                'Not share your account or credentials with others',
                'Not attempt to reverse engineer or interfere with the service',
                'Use the service in compliance with all applicable laws'
            ]
        },
        {
            title: 'Data Ownership and Portability',
            content: 'You retain complete ownership of all data you input into AnthroWeb. We do not claim any rights to your personal information beyond what is necessary to provide the service. You may export or delete your data at any time through your account settings.'
        },
        {
            title: 'Service Availability',
            content: 'We strive to maintain high availability but do not guarantee uninterrupted access. The service may be temporarily unavailable due to maintenance, updates, or technical issues. We are not liable for any data loss or service interruptions.'
        },
        {
            title: 'Limitation of Liability',
            content: 'AnthroWeb is provided for informational and personal tracking purposes only. We are not responsible for any decisions made based on the data or insights provided by the application. The service does not constitute medical, financial, or professional advice. You acknowledge that you use the service at your own risk.'
        },
        {
            title: 'Integrations',
            content: 'The service integrates with a companion study-timer application (Protomo) that shares the same Supabase backend. Study session data may be synced between applications when the integration is enabled.'
        },
        {
            title: 'Changes to Terms',
            content: 'We may update these Terms of Service from time to time. Significant changes will be communicated through the application or via our GitHub repository. Continued use of the service after changes constitutes acceptance of the revised terms.'
        },
        {
            title: 'Open Source',
            content: 'AnthroWeb is an open-source project licensed under the MIT License. You may view, fork, or contribute to the project on our GitHub repository.',
            link: true
        },
        {
            title: 'Termination',
            content: 'You may terminate your account at any time through the Settings page. Upon termination, all your data will be permanently deleted within 30 days. We reserve the right to terminate accounts that violate these terms.'
        }
    ];

    return (
        <>
            <Title title="Terms of Service" />
            <div className="legal-page">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Terms of Service</h2>
                        <span>Terms and conditions for using AnthroWeb</span>
                    </div>
                    <div className="legal-content">
                        {sections.map((section, index) => (
                            <div className="legal-section" key={index}>
                                <h3>{section.title}</h3>
                                {section.link ? (
                                    <p>AnthroWeb is an open-source project licensed under the MIT License. You may view, fork, or contribute to the project on our <a href="https://github.com/Ph1lippus/AnthroWeb" target="_blank" rel="noopener noreferrer" className="auth-link">GitHub repository</a>.</p>
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

export default TermsOfServicePage;